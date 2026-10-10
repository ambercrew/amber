use std::collections::HashMap;

use base64::{Engine as _, engine::general_purpose};
use serde_json::Value;

use crate::assets::utils::image_mime::sniff_image_mime;

/// Decodes a base64 `data:image/...` URI into its mime type and bytes. Sniffed
/// bytes win over the declared mime; `None` for anything that isn't a decodable image.
pub fn decode_image_data_uri(src: &str) -> Option<(String, Vec<u8>)> {
    let rest = src.strip_prefix("data:")?;
    let (header, payload) = rest.split_once(',')?;
    let declared_mime = header.strip_suffix(";base64")?.split(';').next()?;
    if !declared_mime.starts_with("image/") {
        return None;
    }

    let bytes = general_purpose::STANDARD
        .decode(payload)
        .or_else(|_| {
            let compact: String = payload.chars().filter(|c| !c.is_whitespace()).collect();
            general_purpose::STANDARD.decode(compact)
        })
        .ok()?;
    if bytes.is_empty() {
        return None;
    }

    let mime = sniff_image_mime(&bytes).unwrap_or_else(|| declared_mime.to_string());
    Some((mime, bytes))
}

fn is_embedded_image_src(value: &str) -> bool {
    value.starts_with("data:image/")
}

/// Every distinct embedded-image `src` value in a JSON document, at any depth.
pub fn collect_embedded_image_srcs(document: &Value) -> Vec<String> {
    let mut srcs = Vec::new();
    visit_srcs(document, &mut |src| {
        if is_embedded_image_src(src) && !srcs.iter().any(|s| s == src) {
            srcs.push(src.to_string());
        }
    });
    srcs
}

fn visit_srcs(value: &Value, visit: &mut impl FnMut(&str)) {
    match value {
        Value::Object(map) => {
            for (key, value) in map {
                match value {
                    Value::String(src) if key == "src" => visit(src),
                    _ => visit_srcs(value, visit),
                }
            }
        }
        Value::Array(items) => items.iter().for_each(|item| visit_srcs(item, visit)),
        _ => {}
    }
}

/// Replaces each `src` found in `replacements` with its mapped value.
pub fn replace_srcs(value: &mut Value, replacements: &HashMap<String, String>) {
    match value {
        Value::Object(map) => {
            for (key, value) in map.iter_mut() {
                match value {
                    Value::String(src) if key == "src" => {
                        if let Some(replacement) = replacements.get(src.as_str()) {
                            *src = replacement.clone();
                        }
                    }
                    _ => replace_srcs(value, replacements),
                }
            }
        }
        Value::Array(items) => items
            .iter_mut()
            .for_each(|item| replace_srcs(item, replacements)),
        _ => {}
    }
}

/// Cheap pre-check so content without embedded images is never parsed.
pub fn may_contain_embedded_images(content: &str) -> bool {
    content.contains("data:image/")
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    const PNG_DATA_URI: &str = "data:image/png;base64,iVBORw0KGgo=";

    #[test]
    fn decode_image_data_uri_png_returns_sniffed_mime_and_bytes() {
        // Arrange

        let src = PNG_DATA_URI;

        // Act

        let decoded = decode_image_data_uri(src);

        // Assert

        let (mime, bytes) = decoded.unwrap();
        assert_eq!(mime, "image/png");
        assert!(bytes.starts_with(&[0x89, b'P', b'N', b'G']));
    }

    #[test]
    fn decode_image_data_uri_non_image_returns_none() {
        // Arrange

        let src = "data:text/plain;base64,aGVsbG8=";

        // Act

        let decoded = decode_image_data_uri(src);

        // Assert

        assert!(decoded.is_none());
    }

    #[test]
    fn decode_image_data_uri_not_base64_returns_none() {
        // Arrange

        let src = "data:image/svg+xml;utf8,<svg></svg>";

        // Act

        let decoded = decode_image_data_uri(src);

        // Assert

        assert!(decoded.is_none());
    }

    #[test]
    fn collect_embedded_image_srcs_nested_document_returns_distinct_data_uris() {
        // Arrange

        let document = json!({
            "root": { "children": [
                { "type": "image", "src": PNG_DATA_URI },
                { "type": "paragraph", "children": [{ "type": "image", "src": PNG_DATA_URI }] },
                { "type": "image", "src": "amber-asset:abc" },
                { "type": "image", "src": "https://example.com/a.png" },
            ]}
        });

        // Act

        let srcs = collect_embedded_image_srcs(&document);

        // Assert

        assert_eq!(srcs, vec![PNG_DATA_URI.to_string()]);
    }

    #[test]
    fn replace_srcs_mapped_src_is_replaced_everywhere() {
        // Arrange

        let mut document = json!({
            "a": { "src": PNG_DATA_URI },
            "b": [{ "src": PNG_DATA_URI }, { "src": "other" }],
        });
        let replacements =
            HashMap::from([(PNG_DATA_URI.to_string(), "amber-asset:abc".to_string())]);

        // Act

        replace_srcs(&mut document, &replacements);

        // Assert

        assert_eq!(
            document,
            json!({
                "a": { "src": "amber-asset:abc" },
                "b": [{ "src": "amber-asset:abc" }, { "src": "other" }],
            })
        );
    }
}
