use std::collections::HashMap;
use std::io::{Cursor, Read};

use base64::{Engine as _, engine::general_purpose};
use quick_xml::Reader;
use quick_xml::events::Event;
use regex::Regex;
use zip::ZipArchive;

use crate::common::api_error::ApiError;

use super::dto::EpubExtractionDto;
use super::import_api::sniff_image_mime;

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

struct ManifestItem {
    href: String,
    media_type: String,
}

struct OpfPackage {
    manifest: HashMap<String, ManifestItem>,
    spine: Vec<String>,
    title: Option<String>,
    authors: Option<String>,
    date: Option<String>,
}

pub fn extract_epub_html(bytes: Vec<u8>) -> Result<EpubExtractionDto, ApiError> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid_epub_error())?;

    let container_xml =
        read_entry_text(&mut archive, "META-INF/container.xml").ok_or_else(invalid_epub_error)?;
    let opf_path = find_opf_path(&container_xml).ok_or_else(invalid_epub_error)?;

    let opf_xml = read_entry_text(&mut archive, &opf_path).ok_or_else(invalid_epub_error)?;
    let opf_dir = parent_dir(&opf_path);

    let package = parse_opf(&opf_xml).ok_or_else(invalid_epub_error)?;

    if package.spine.is_empty() {
        return Err(no_content_error());
    }

    let mut resource_media_types: HashMap<String, String> = HashMap::new();
    for item in package.manifest.values() {
        let resolved = resolve_path(&opf_dir, &item.href);
        resource_media_types.insert(resolved, item.media_type.clone());
    }

    let mut html = String::new();
    let mut chapter_count = 0usize;

    for idref in &package.spine {
        let Some(item) = package.manifest.get(idref) else {
            continue;
        };
        let chapter_path = resolve_path(&opf_dir, &item.href);
        let Some(chapter_bytes) = read_entry_bytes(&mut archive, &chapter_path) else {
            continue;
        };
        let chapter_text = String::from_utf8_lossy(&chapter_bytes).into_owned();
        let body = extract_body(&chapter_text);
        let chapter_dir = parent_dir(&chapter_path);
        let inlined = inline_images(&body, &chapter_dir, &mut archive, &resource_media_types);
        html.push_str(&inlined);
        chapter_count += 1;
    }

    if html.trim().is_empty() {
        return Err(no_content_error());
    }

    Ok(EpubExtractionDto {
        title: package.title,
        authors: package.authors,
        publication_date: package.date,
        html,
        chapter_count,
    })
}

fn invalid_epub_error() -> ApiError {
    ApiError::new("invalid-epub".to_string())
}

fn no_content_error() -> ApiError {
    ApiError::new("no-content".to_string())
}

fn find_opf_path(container_xml: &str) -> Option<String> {
    let mut reader = Reader::from_str(container_xml);
    reader.config_mut().trim_text(true);

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                if e.local_name().as_ref() == b"rootfile" {
                    for attr in e.attributes().flatten() {
                        if attr.key.local_name().as_ref() == b"full-path" {
                            return Some(String::from_utf8_lossy(&attr.value).into_owned());
                        }
                    }
                }
            }
            Ok(Event::Eof) => return None,
            Err(_) => return None,
            _ => {}
        }
    }
}

fn parse_opf(opf_xml: &str) -> Option<OpfPackage> {
    let mut reader = Reader::from_str(opf_xml);
    reader.config_mut().trim_text(true);

    let mut manifest = HashMap::new();
    let mut spine = Vec::new();
    let mut title: Option<String> = None;
    let mut creators: Vec<String> = Vec::new();
    let mut date: Option<String> = None;
    let mut capture: Option<&'static str> = None;

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => match e.local_name().as_ref() {
                b"title" => capture = Some("title"),
                b"creator" => capture = Some("creator"),
                b"date" => capture = Some("date"),
                b"item" => process_manifest_item(&e, &mut manifest),
                b"itemref" => process_spine_itemref(&e, &mut spine),
                _ => {}
            },
            Ok(Event::Empty(e)) => match e.local_name().as_ref() {
                b"item" => process_manifest_item(&e, &mut manifest),
                b"itemref" => process_spine_itemref(&e, &mut spine),
                _ => {}
            },
            Ok(Event::Text(e)) => {
                if let Some(kind) = capture
                    && let Ok(text) = e.decode()
                {
                    let text = text.into_owned();
                    match kind {
                        "title" => title = Some(text),
                        "creator" => creators.push(text),
                        "date" => date = Some(text),
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                if matches!(e.local_name().as_ref(), b"title" | b"creator" | b"date") {
                    capture = None;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => return None,
            _ => {}
        }
    }

    Some(OpfPackage {
        manifest,
        spine,
        title,
        authors: if creators.is_empty() {
            None
        } else {
            Some(creators.join(", "))
        },
        date,
    })
}

fn process_manifest_item(
    e: &quick_xml::events::BytesStart,
    manifest: &mut HashMap<String, ManifestItem>,
) {
    let mut id = None;
    let mut href = None;
    let mut media_type = None;

    for attr in e.attributes().flatten() {
        match attr.key.local_name().as_ref() {
            b"id" => id = Some(String::from_utf8_lossy(&attr.value).into_owned()),
            b"href" => href = Some(String::from_utf8_lossy(&attr.value).into_owned()),
            b"media-type" => media_type = Some(String::from_utf8_lossy(&attr.value).into_owned()),
            _ => {}
        }
    }

    if let (Some(id), Some(href)) = (id, href) {
        manifest.insert(
            id,
            ManifestItem {
                href: percent_decode(&href),
                media_type: media_type.unwrap_or_default(),
            },
        );
    }
}

fn process_spine_itemref(e: &quick_xml::events::BytesStart, spine: &mut Vec<String>) {
    for attr in e.attributes().flatten() {
        if attr.key.local_name().as_ref() == b"idref" {
            spine.push(String::from_utf8_lossy(&attr.value).into_owned());
        }
    }
}

fn extract_body(xhtml: &str) -> String {
    let re = Regex::new(r"(?is)<body\b[^>]*>(.*)</body>").expect("valid body regex");
    match re.captures(xhtml) {
        Some(caps) => caps
            .get(1)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default(),
        None => xhtml.to_string(),
    }
}

fn inline_images(
    html: &str,
    chapter_dir: &str,
    archive: &mut ZipArchive<Cursor<Vec<u8>>>,
    resource_media_types: &HashMap<String, String>,
) -> String {
    let html = replace_attr(
        html,
        "img",
        "src",
        chapter_dir,
        archive,
        resource_media_types,
    );
    replace_attr(
        &html,
        "image",
        "xlink:href",
        chapter_dir,
        archive,
        resource_media_types,
    )
}

fn replace_attr(
    html: &str,
    tag: &str,
    attr: &str,
    chapter_dir: &str,
    archive: &mut ZipArchive<Cursor<Vec<u8>>>,
    resource_media_types: &HashMap<String, String>,
) -> String {
    let escaped_tag = regex::escape(tag);
    let escaped_attr = regex::escape(attr);
    let pattern = format!(
        r#"(?is)(<{}\b[^>]*\b{}=")([^"]*)(")"#,
        escaped_tag, escaped_attr
    );
    let re = Regex::new(&pattern).expect("valid attribute regex");

    let mut result = String::with_capacity(html.len());
    let mut last_end = 0;

    for caps in re.captures_iter(html) {
        let m = caps.get(0).expect("full match always present");
        result.push_str(&html[last_end..m.start()]);

        let prefix = caps.get(1).expect("prefix group present").as_str();
        let href = caps.get(2).expect("href group present").as_str();
        let suffix = caps.get(3).expect("suffix group present").as_str();

        let decoded_href = percent_decode(&html_unescape(href));
        let resolved = resolve_path(chapter_dir, &decoded_href);
        let replacement = inline_image_data_uri(archive, &resolved, resource_media_types)
            .unwrap_or_else(|| href.to_string());

        result.push_str(prefix);
        result.push_str(&replacement);
        result.push_str(suffix);
        last_end = m.end();
    }

    result.push_str(&html[last_end..]);
    result
}

fn inline_image_data_uri(
    archive: &mut ZipArchive<Cursor<Vec<u8>>>,
    path: &str,
    resource_media_types: &HashMap<String, String>,
) -> Option<String> {
    let bytes = read_entry_bytes(archive, path)?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return None;
    }

    let mime = resource_media_types
        .get(path)
        .filter(|m| !m.is_empty())
        .cloned()
        .or_else(|| sniff_image_mime(&bytes))?;

    Some(format!(
        "data:{};base64,{}",
        mime,
        general_purpose::STANDARD.encode(&bytes)
    ))
}

fn read_entry_bytes(archive: &mut ZipArchive<Cursor<Vec<u8>>>, name: &str) -> Option<Vec<u8>> {
    let mut file = archive.by_name(name).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    Some(buf)
}

fn read_entry_text(archive: &mut ZipArchive<Cursor<Vec<u8>>>, name: &str) -> Option<String> {
    read_entry_bytes(archive, name).map(|b| String::from_utf8_lossy(&b).into_owned())
}

fn resolve_path(base_dir: &str, relative: &str) -> String {
    if relative.contains("://") || relative.starts_with("data:") {
        return relative.to_string();
    }

    let mut segments: Vec<&str> = if relative.starts_with('/') {
        Vec::new()
    } else {
        base_dir.split('/').filter(|s| !s.is_empty()).collect()
    };

    for part in relative.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            other => segments.push(other),
        }
    }

    segments.join("/")
}

fn parent_dir(path: &str) -> String {
    match path.rfind('/') {
        Some(idx) => path[..idx].to_string(),
        None => String::new(),
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16)
        {
            out.push(byte);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }

    String::from_utf8_lossy(&out).into_owned()
}

fn html_unescape(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use zip::write::SimpleFileOptions;

    use super::*;

    fn build_epub(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let cursor = Cursor::new(&mut buf);
            let mut writer = zip::ZipWriter::new(cursor);
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            for (name, contents) in entries {
                writer.start_file(*name, options).unwrap();
                writer.write_all(contents).unwrap();
            }
            writer.finish().unwrap();
        }
        buf
    }

    const CONTAINER_XML: &str = r#"<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#;

    fn opf(spine_items: &str, manifest_items: &str, metadata: &str) -> String {
        format!(
            r#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    {metadata}
  </metadata>
  <manifest>
    {manifest_items}
  </manifest>
  <spine>
    {spine_items}
  </spine>
</package>"#
        )
    }

    #[test]
    fn extract_epub_html_valid_epub_returns_html_and_metadata() {
        // Arrange

        let metadata = r#"<dc:title>My Book</dc:title><dc:creator>Jane Doe</dc:creator><dc:date>2020-01-01</dc:date>"#;
        let manifest =
            r#"<item id="chap1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>"#;
        let spine = r#"<itemref idref="chap1"/>"#;
        let opf_xml = opf(spine, manifest, metadata);
        let chapter = br#"<html><body><p>Chapter 1 content</p></body></html>"#;

        let bytes = build_epub(&[
            ("META-INF/container.xml", CONTAINER_XML.as_bytes()),
            ("OEBPS/content.opf", opf_xml.as_bytes()),
            ("OEBPS/chapter1.xhtml", chapter),
        ]);

        // Act

        let result = extract_epub_html(bytes);

        // Assert

        let extraction = result.ok().expect("expected extraction to succeed");
        assert!(extraction.html.contains("Chapter 1 content"));
        assert_eq!(extraction.chapter_count, 1);
        assert_eq!(extraction.title, Some("My Book".to_string()));
        assert_eq!(extraction.authors, Some("Jane Doe".to_string()));
        assert_eq!(extraction.publication_date, Some("2020-01-01".to_string()));
    }

    #[test]
    fn extract_epub_html_invalid_zip_returns_error() {
        // Arrange

        let bytes = b"not a zip".to_vec();

        // Act

        let result = extract_epub_html(bytes);

        // Assert

        assert!(result.is_err());
    }

    #[test]
    fn extract_epub_html_missing_container_xml_returns_error() {
        // Arrange

        let bytes = build_epub(&[("some-file.txt", b"hello")]);

        // Act

        let result = extract_epub_html(bytes);

        // Assert

        assert!(result.is_err());
    }

    #[test]
    fn extract_epub_html_empty_spine_returns_no_content_error() {
        // Arrange

        let opf_xml = opf("", "", "");
        let bytes = build_epub(&[
            ("META-INF/container.xml", CONTAINER_XML.as_bytes()),
            ("OEBPS/content.opf", opf_xml.as_bytes()),
        ]);

        // Act

        let result = extract_epub_html(bytes);

        // Assert

        assert!(result.is_err());
    }

    #[test]
    fn extract_epub_html_inlines_images_as_data_uris() {
        // Arrange

        let manifest = r#"
            <item id="chap1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
            <item id="img1" href="images/cover.png" media-type="image/png"/>
        "#;
        let spine = r#"<itemref idref="chap1"/>"#;
        let opf_xml = opf(spine, manifest, "");
        let chapter = br#"<html><body><img src="images/cover.png" alt="cover"/></body></html>"#;
        let png_bytes: &[u8] = &[0x89, b'P', b'N', b'G', 0, 0, 0, 0];

        let bytes = build_epub(&[
            ("META-INF/container.xml", CONTAINER_XML.as_bytes()),
            ("OEBPS/content.opf", opf_xml.as_bytes()),
            ("OEBPS/chapter1.xhtml", chapter),
            ("OEBPS/images/cover.png", png_bytes),
        ]);

        // Act

        let result = extract_epub_html(bytes);

        // Assert

        let extraction = result.ok().expect("expected extraction to succeed");
        assert!(extraction.html.contains("data:image/png;base64,"));
        assert!(!extraction.html.contains("images/cover.png"));
    }
}
