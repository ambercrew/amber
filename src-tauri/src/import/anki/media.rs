use std::collections::HashMap;
use std::io::Cursor;
use std::sync::LazyLock;

use base64::{Engine as _, engine::general_purpose};
use prost::Message;
use regex::{Captures, Regex};
use zip::ZipArchive;

use crate::assets::entities::asset::Asset;
use crate::assets::utils::image_mime::sniff_image_mime;
use crate::assets::value_objects::asset_id::AssetId;
use crate::import::epub::{html_unescape, percent_decode};

use super::package::{decode_if_zstd, read_entry};

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

static IMAGE_SRC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)(<img\b[^>]*?\bsrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#)
        .expect("valid image regex")
});
/// A video's poster frame, the snapshot a subs2srs-style card shows; the video itself can't play.
static VIDEO_POSTER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)<video\b[^>]*?\bposter\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>"#)
        .expect("valid video regex")
});
static SOUND: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[sound:[^\]]*\]").expect("valid sound regex"));

/// Only the field read here; prost skips the rest of Anki's `MediaEntry`.
#[derive(Clone, PartialEq, Message)]
struct MediaEntry {
    #[prost(string, tag = "1")]
    name: String,
}

#[derive(Clone, PartialEq, Message)]
struct MediaEntries {
    #[prost(message, repeated, tag = "1")]
    entries: Vec<MediaEntry>,
}

pub struct LocalImage {
    pub asset_id: AssetId,
    pub width: u32,
    pub height: u32,
}

/// Swaps a card's media filenames for stored images, read from the package as first referenced.
pub struct MediaLocalizer<'a> {
    archive: &'a mut ZipArchive<Cursor<Vec<u8>>>,
    /// Filename → the zip entry holding it.
    entries: HashMap<String, String>,
    srcs: HashMap<String, Option<String>>,
    images: Vec<Asset>,
}

impl<'a> MediaLocalizer<'a> {
    pub fn new(archive: &'a mut ZipArchive<Cursor<Vec<u8>>>) -> Self {
        let entries = read_entry(archive, "media")
            .and_then(decode_if_zstd)
            .map(|bytes| parse_media_map(&bytes))
            .unwrap_or_default();
        Self {
            archive,
            entries,
            srcs: HashMap::new(),
            images: Vec::new(),
        }
    }

    pub fn into_images(self) -> Vec<Asset> {
        self.images
    }

    /// Images become asset srcs and sounds are dropped, having nothing to play them.
    pub fn localize(&mut self, html: &str) -> String {
        let html = SOUND.replace_all(html, "");
        let html = VIDEO_POSTER.replace_all(&html, |caps: &Captures| {
            let poster = caps
                .get(1)
                .or_else(|| caps.get(2))
                .map_or("", |m| m.as_str());
            format!("<img src=\"{poster}\">{}", &caps[0])
        });
        IMAGE_SRC
            .replace_all(&html, |caps: &Captures| {
                let src = caps
                    .get(2)
                    .or_else(|| caps.get(3))
                    .or_else(|| caps.get(4))
                    .map_or("", |m| m.as_str());
                match self.resolve(src) {
                    Some(resolved) => format!("{}\"{resolved}\"", &caps[1]),
                    None => caps[0].to_string(),
                }
            })
            .into_owned()
    }

    /// The first image in `html` that's stored as an asset, with its pixel size.
    pub fn first_image(&mut self, html: &str) -> Option<LocalImage> {
        let resolved = self.resolve(first_src(html)?)?;
        let image = self
            .images
            .iter()
            .find(|image| image.id.src() == resolved)?;
        let (width, height) = image::ImageReader::new(Cursor::new(&image.data))
            .with_guessed_format()
            .ok()?
            .into_dimensions()
            .ok()?;
        Some(LocalImage {
            asset_id: image.id.clone(),
            width,
            height,
        })
    }

    /// The raw bytes of the first file `html` references as an image, of any type and not stored.
    pub fn first_file(&mut self, html: &str) -> Option<Vec<u8>> {
        let (entry, _) = self.find_entry(first_src(html)?)?;
        read_entry(self.archive, &entry).and_then(decode_if_zstd)
    }

    /// The zip entry holding the media file `src` names, and that file's name.
    fn find_entry(&self, src: &str) -> Option<(String, String)> {
        let unescaped = html_unescape(src);
        [src.to_string(), percent_decode(&unescaped), unescaped]
            .into_iter()
            .find_map(|name| Some((self.entries.get(&name)?.clone(), name)))
    }

    fn resolve(&mut self, src: &str) -> Option<String> {
        if let Some(cached) = self.srcs.get(src) {
            return cached.clone();
        }
        let resolved = self
            .find_entry(src)
            .and_then(|(entry, name)| self.read_image(&entry, &name));
        self.srcs.insert(src.to_string(), resolved.clone());
        resolved
    }

    fn read_image(&mut self, entry: &str, name: &str) -> Option<String> {
        let bytes = read_entry(self.archive, entry).and_then(decode_if_zstd)?;
        if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
            return None;
        }
        let is_svg = name.to_ascii_lowercase().ends_with(".svg");
        let mime_type =
            sniff_image_mime(&bytes).or_else(|| is_svg.then(|| "image/svg+xml".to_string()))?;
        // SVG is never stored as an asset; inlined, the frontend keeps it as a broken-asset data URI.
        if mime_type == "image/svg+xml" {
            return Some(format!(
                "data:image/svg+xml;base64,{}",
                general_purpose::STANDARD.encode(&bytes)
            ));
        }
        let id = AssetId::from_bytes(&bytes);
        let src = id.src();
        if !self.images.iter().any(|image| image.id == id) {
            self.images.push(Asset {
                id,
                mime_type,
                data: bytes,
            });
        }
        Some(src)
    }
}

fn first_src(html: &str) -> Option<&str> {
    let caps = IMAGE_SRC.captures(html)?;
    caps.get(2)
        .or_else(|| caps.get(3))
        .or_else(|| caps.get(4))
        .map(|src| src.as_str())
}

/// The legacy format maps entry to filename as JSON; the current one lists filenames in entry order.
fn parse_media_map(bytes: &[u8]) -> HashMap<String, String> {
    if let Ok(map) = serde_json::from_slice::<HashMap<String, String>>(bytes) {
        return map.into_iter().map(|(entry, name)| (name, entry)).collect();
    }
    MediaEntries::decode(bytes)
        .map(|media| {
            media
                .entries
                .into_iter()
                .enumerate()
                .map(|(index, entry)| (entry.name, index.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use zip::write::SimpleFileOptions;

    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

    fn archive(entries: &[(&str, &[u8])]) -> ZipArchive<Cursor<Vec<u8>>> {
        let mut buf = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(Cursor::new(&mut buf));
            for (name, contents) in entries {
                writer
                    .start_file(*name, SimpleFileOptions::default())
                    .unwrap();
                writer.write_all(contents).unwrap();
            }
            writer.finish().unwrap();
        }
        ZipArchive::new(Cursor::new(buf)).unwrap()
    }

    #[test]
    fn localize_legacy_media_replaces_src_and_drops_sounds() {
        // Arrange

        let mut archive = archive(&[("media", br#"{"0": "cat image.png"}"#), ("0", PNG)]);
        let mut localizer = MediaLocalizer::new(&mut archive);

        // Act

        let html = localizer.localize("<img src=\"cat%20image.png\">[sound:meow.mp3]");

        // Assert

        let images = localizer.into_images();
        assert_eq!(1, images.len());
        assert_eq!(format!("<img src=\"{}\">", images[0].id.src()), html);
    }

    #[test]
    fn localize_current_media_reads_compressed_entries() {
        // Arrange

        let media = MediaEntries {
            entries: vec![MediaEntry {
                name: "cat.png".to_string(),
            }],
        }
        .encode_to_vec();
        let compress = |bytes: &[u8]| {
            ruzstd::encoding::compress_to_vec(bytes, ruzstd::encoding::CompressionLevel::Fastest)
        };
        let mut archive = archive(&[("media", &compress(&media)), ("0", &compress(PNG))]);
        let mut localizer = MediaLocalizer::new(&mut archive);

        // Act

        let html = localizer.localize("<img src=cat.png>");

        // Assert

        let images = localizer.into_images();
        assert_eq!(PNG, images[0].data.as_slice());
        assert_eq!(format!("<img src=\"{}\">", images[0].id.src()), html);
    }

    #[test]
    fn localize_video_poster_becomes_image() {
        // Arrange

        let mut archive = archive(&[("media", br#"{"0": "shot.jpg"}"#), ("0", PNG)]);
        let mut localizer = MediaLocalizer::new(&mut archive);

        // Act

        let html = localizer.localize("<video poster=\"shot.jpg\"><source src=\"v.mp4\"></video>");

        // Assert

        let images = localizer.into_images();
        assert!(html.starts_with(&format!("<img src=\"{}\"><video", images[0].id.src())));
    }

    #[test]
    fn localize_unknown_file_keeps_src() {
        // Arrange

        let mut archive = archive(&[("media", b"{}")]);
        let mut localizer = MediaLocalizer::new(&mut archive);

        // Act

        let html = localizer.localize("<img src=\"missing.png\">");

        // Assert

        assert_eq!("<img src=\"missing.png\">", html);
    }
}
