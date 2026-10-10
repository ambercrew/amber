/// Identifies common raster formats from their magic bytes.
pub fn sniff_image_mime(bytes: &[u8]) -> Option<String> {
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
