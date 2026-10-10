use std::sync::Arc;
use std::time::Duration;

use base64::{Engine as _, engine::general_purpose};
use injector::injector::Injector;
use pdf_oxide::converters::ConversionOptions;
use pdf_oxide::document::PdfDocument;
use pdf_oxide::extractors::xmp::XmpExtractor;
use tauri::{Emitter, State};
use tauri_plugin_http::reqwest::{
    self,
    header::{CONTENT_TYPE, REFERER},
};

use crate::assets::services::asset_service::AssetService;
use crate::assets::utils::image_mime::sniff_image_mime;
use crate::common::api_error::ApiError;
use crate::infrastructure::extensions::unit_of_work::UnitOfWorkExt;

use super::dto::{
    EpubExtractionDto, FetchedImageDto, FetchedPageDto, PdfExtractionDto, PdfImportProgressEvent,
};
use super::epub::extract_epub_html;

const MAX_PAGE_BYTES: usize = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

#[tauri::command]
pub async fn fetch_page(url: String) -> Result<FetchedPageDto, ApiError> {
    let client = build_client(Duration::from_secs(20))?;
    let response = client.get(&url).send().await?;

    let final_url = response.url().to_string();
    let path = response.url().path().to_lowercase();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    let bytes = read_capped(response, MAX_PAGE_BYTES).await?;

    Ok(match classify_page(&content_type, &path, &bytes) {
        PageKind::Pdf => FetchedPageDto::Pdf {
            final_url,
            bytes_base64: general_purpose::STANDARD.encode(&bytes),
        },
        PageKind::Epub => FetchedPageDto::Epub {
            final_url,
            bytes_base64: general_purpose::STANDARD.encode(&bytes),
        },
        PageKind::Markdown => FetchedPageDto::Markdown {
            final_url,
            text: String::from_utf8_lossy(&bytes).into_owned(),
        },
        PageKind::Html => FetchedPageDto::Html {
            final_url,
            text: String::from_utf8_lossy(&bytes).into_owned(),
        },
        PageKind::Other => FetchedPageDto::Other {
            final_url,
            content_type,
        },
    })
}

#[derive(Debug, PartialEq)]
enum PageKind {
    Pdf,
    Epub,
    Markdown,
    Html,
    Other,
}

// Servers often send EPUB as `application/octet-stream` and Markdown as `text/plain`, so the URL's extension breaks the tie.
fn classify_page(content_type: &str, path: &str, bytes: &[u8]) -> PageKind {
    if content_type.contains("pdf") || bytes.starts_with(b"%PDF-") {
        return PageKind::Pdf;
    }
    let is_zip = bytes.starts_with(b"PK\x03\x04");
    if is_zip && (content_type.contains("epub") || path.ends_with(".epub")) {
        return PageKind::Epub;
    }
    let has_markdown_extension = path.ends_with(".md") || path.ends_with(".markdown");
    if content_type.contains("markdown")
        || (has_markdown_extension && !content_type.contains("html"))
    {
        return PageKind::Markdown;
    }
    if content_type.contains("html") || content_type.is_empty() {
        return PageKind::Html;
    }
    PageKind::Other
}

#[tauri::command]
pub async fn fetch_image(
    url: String,
    referer: Option<String>,
) -> Result<FetchedImageDto, ApiError> {
    let client = build_client(Duration::from_secs(10))?;
    let mut request = client.get(&url);
    if let Some(referer) = referer {
        request = request.header(REFERER, referer);
    }
    // An error page (404, rate limit) would otherwise be stored as the image.
    let response = request.send().await?.error_for_status()?;

    let declared_mime = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap_or("application/octet-stream")
        .to_string();

    let bytes = read_capped(response, MAX_IMAGE_BYTES).await?;
    let mime = sniff_image_mime(&bytes).unwrap_or(declared_mime);

    Ok(FetchedImageDto {
        mime,
        bytes_base64: general_purpose::STANDARD.encode(&bytes),
    })
}

#[tauri::command]
pub async fn extract_pdf<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request_id: String,
    bytes_base64: String,
) -> Result<PdfExtractionDto, ApiError> {
    let bytes = general_purpose::STANDARD.decode(&bytes_base64)?;

    tauri::async_runtime::spawn_blocking(move || extract_pdf_sync(&app, &request_id, bytes))
        .await
        .map_err(|e| ApiError::new(e.to_string()))?
}

fn extract_pdf_sync<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request_id: &str,
    bytes: Vec<u8>,
) -> Result<PdfExtractionDto, ApiError> {
    extract_pdf_html(bytes, |done, total| {
        let _ = app.emit(
            "pdf-import-progress",
            PdfImportProgressEvent {
                request_id: request_id.to_string(),
                done,
                total,
            },
        );
    })
}

fn extract_pdf_html(
    bytes: Vec<u8>,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<PdfExtractionDto, ApiError> {
    let doc = PdfDocument::from_bytes(bytes)?;
    let page_count = doc.page_count()?;

    let options = ConversionOptions {
        include_images: true,
        detect_headings: false,
        include_form_fields: false,
        ..Default::default()
    };

    let mut html = String::new();
    let mut saw_text = false;

    for i in 0..page_count {
        if !saw_text && doc.has_text_layer(i)? {
            saw_text = true;
        }
        html.push_str(&page_to_html(&doc, i, &options)?);
        on_progress(i + 1, page_count);
    }

    if !saw_text {
        return Err(ApiError::new("no-text-layer".to_string()));
    }

    let metadata = XmpExtractor::extract(&doc).ok().flatten();
    let title = metadata.as_ref().and_then(|m| m.dc_title.clone());
    let authors = metadata.as_ref().and_then(|m| {
        if m.dc_creator.is_empty() {
            None
        } else {
            Some(m.dc_creator.join(", "))
        }
    });
    let publication_date = metadata.as_ref().and_then(|m| m.xmp_create_date.clone());

    Ok(PdfExtractionDto {
        title,
        authors,
        publication_date,
        html,
        page_count,
    })
}

fn page_to_html(
    doc: &PdfDocument,
    page_index: usize,
    options: &ConversionOptions,
) -> Result<String, ApiError> {
    Ok(doc.to_html(page_index, options)?)
}

#[tauri::command]
pub async fn get_pdf_page_count(bytes_base64: String) -> Result<u32, ApiError> {
    let bytes = general_purpose::STANDARD.decode(&bytes_base64)?;

    tauri::async_runtime::spawn_blocking(move || {
        let doc = PdfDocument::from_bytes(bytes)?;
        Ok(doc.page_count()? as u32)
    })
    .await
    .map_err(|e| ApiError::new(e.to_string()))?
}

#[tauri::command]
pub async fn get_pdf_page_html(bytes_base64: String, page_index: u32) -> Result<String, ApiError> {
    let bytes = general_purpose::STANDARD.decode(&bytes_base64)?;

    tauri::async_runtime::spawn_blocking(move || {
        let doc = PdfDocument::from_bytes(bytes)?;
        let options = ConversionOptions {
            include_images: true,
            ..Default::default()
        };
        page_to_html(&doc, page_index as usize, &options)
    })
    .await
    .map_err(|e| ApiError::new(e.to_string()))?
}

#[tauri::command]
pub async fn extract_epub(
    injector: State<'_, Arc<Injector>>,
    bytes_base64: String,
) -> Result<EpubExtractionDto, ApiError> {
    let bytes = general_purpose::STANDARD.decode(&bytes_base64)?;

    let extraction = tauri::async_runtime::spawn_blocking(move || extract_epub_html(bytes))
        .await
        .map_err(|e| ApiError::new(e.to_string()))??;

    // Unreferenced until the learning asset is created; a sweep reclaims them if it never is.
    let scope = injector.start_scope();
    let asset_service = scope.resolve::<dyn AssetService>().await;
    for image in &extraction.images {
        asset_service.store(image).await?;
    }
    scope.save_changes().await?;
    Ok(extraction.dto)
}

fn build_client(timeout: Duration) -> Result<reqwest::Client, ApiError> {
    reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| ApiError::new(e.to_string()))
}

async fn read_capped(response: reqwest::Response, cap: usize) -> Result<Vec<u8>, ApiError> {
    let bytes = response.bytes().await?;
    if bytes.len() > cap {
        return Err(ApiError::new("The response was too large.".to_string()));
    }
    Ok(bytes.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_page_epub_content_type_returns_epub() {
        // Arrange

        let bytes = b"PK\x03\x04rest";

        // Act

        let kind = classify_page("application/epub+zip", "/book", bytes);

        // Assert

        assert_eq!(kind, PageKind::Epub);
    }

    #[test]
    fn classify_page_octet_stream_with_epub_extension_returns_epub() {
        // Arrange

        let bytes = b"PK\x03\x04rest";

        // Act

        let kind = classify_page("application/octet-stream", "/books/1.epub", bytes);

        // Assert

        assert_eq!(kind, PageKind::Epub);
    }

    #[test]
    fn classify_page_zip_without_epub_hint_returns_other() {
        // Arrange

        let bytes = b"PK\x03\x04rest";

        // Act

        let kind = classify_page("application/zip", "/archive.zip", bytes);

        // Assert

        assert_eq!(kind, PageKind::Other);
    }

    #[test]
    fn classify_page_markdown_content_type_returns_markdown() {
        // Arrange

        let bytes = b"# Title";

        // Act

        let kind = classify_page("text/markdown; charset=utf-8", "/notes", bytes);

        // Assert

        assert_eq!(kind, PageKind::Markdown);
    }

    #[test]
    fn classify_page_plain_text_with_md_extension_returns_markdown() {
        // Arrange

        let bytes = b"# Title";

        // Act

        let kind = classify_page(
            "text/plain; charset=utf-8",
            "/user/repo/main/readme.md",
            bytes,
        );

        // Assert

        assert_eq!(kind, PageKind::Markdown);
    }

    #[test]
    fn classify_page_html_with_md_extension_returns_html() {
        // Arrange

        let bytes = b"<html></html>";

        // Act

        let kind = classify_page("text/html", "/user/repo/blob/main/readme.md", bytes);

        // Assert

        assert_eq!(kind, PageKind::Html);
    }

    #[test]
    fn classify_page_pdf_magic_returns_pdf() {
        // Arrange

        let bytes = b"%PDF-1.7";

        // Act

        let kind = classify_page("application/octet-stream", "/file", bytes);

        // Assert

        assert_eq!(kind, PageKind::Pdf);
    }

    #[test]
    fn extract_pdf_html_pdf_with_text_layer_returns_html_and_reports_progress() {
        // Arrange

        let bytes = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/example.pdf"
        ))
        .unwrap();
        let mut progress_calls = Vec::new();

        // Act

        let result = extract_pdf_html(bytes, |done, total| progress_calls.push((done, total)));

        // Assert

        let extraction = result.ok().expect("expected extraction to succeed");
        assert!(extraction.html.contains("Page 1 content"));
        assert_eq!(extraction.page_count, 1);
        assert_eq!(progress_calls, vec![(1, 1)]);
    }

    #[test]
    fn extract_pdf_html_invalid_bytes_returns_error() {
        // Arrange

        let bytes = b"not a pdf".to_vec();

        // Act

        let result = extract_pdf_html(bytes, |_, _| {});

        // Assert

        assert!(result.is_err());
    }

    fn fixture_bytes() -> Vec<u8> {
        std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/example.pdf"
        ))
        .unwrap()
    }

    #[test]
    fn page_to_html_valid_page_returns_html_for_that_page_only() {
        // Arrange

        let doc =
            PdfDocument::from_bytes(fixture_bytes()).expect("expected the fixture PDF to parse");
        let options = ConversionOptions {
            include_images: true,
            ..Default::default()
        };

        // Act

        let html = page_to_html(&doc, 0, &options)
            .ok()
            .expect("expected page_to_html to succeed");

        // Assert

        assert!(html.contains("Page 1 content"));
    }
}
