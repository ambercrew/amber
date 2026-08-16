use std::time::Duration;

use base64::{Engine as _, engine::general_purpose};
use pdf_oxide::converters::ConversionOptions;
use pdf_oxide::document::PdfDocument;
use pdf_oxide::extractors::xmp::XmpExtractor;
use tauri::Emitter;
use tauri_plugin_http::reqwest::{
    self,
    header::{CONTENT_TYPE, REFERER},
};

use crate::common::api_error::ApiError;

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
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let bytes = read_capped(response, MAX_PAGE_BYTES).await?;

    if content_type.contains("pdf") || bytes.starts_with(b"%PDF-") {
        return Ok(FetchedPageDto::Pdf {
            final_url,
            bytes_base64: general_purpose::STANDARD.encode(&bytes),
        });
    }

    if content_type.contains("html") || content_type.is_empty() {
        return Ok(FetchedPageDto::Html {
            final_url,
            text: String::from_utf8_lossy(&bytes).into_owned(),
        });
    }

    Ok(FetchedPageDto::Other {
        final_url,
        content_type,
    })
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
    let response = request.send().await?;

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
        ..Default::default()
    };

    let mut html = String::new();
    let mut saw_text = false;

    for i in 0..page_count {
        if !saw_text && doc.has_text_layer(i)? {
            saw_text = true;
        }
        html.push_str(&doc.to_html(i, &options)?);
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

#[tauri::command]
pub async fn extract_epub(bytes_base64: String) -> Result<EpubExtractionDto, ApiError> {
    let bytes = general_purpose::STANDARD.decode(&bytes_base64)?;

    tauri::async_runtime::spawn_blocking(move || extract_epub_html(bytes))
        .await
        .map_err(|e| ApiError::new(e.to_string()))?
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

pub(super) fn sniff_image_mime(bytes: &[u8]) -> Option<String> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("image/png".to_string())
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg".to_string())
    } else if bytes.starts_with(b"GIF8") {
        Some("image/gif".to_string())
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("image/webp".to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
