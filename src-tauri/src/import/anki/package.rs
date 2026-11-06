use std::io::{Cursor, Read};

use zip::ZipArchive;

const ZSTD_MAGIC: &[u8] = &[0x28, 0xb5, 0x2f, 0xfd];

// When the current format is present, the legacy files are only a stub asking to update Anki.
pub(super) fn read_collection_bytes(archive: &mut ZipArchive<Cursor<Vec<u8>>>) -> Option<Vec<u8>> {
    if let Some(bytes) = read_entry(archive, "collection.anki21b") {
        return decode_zstd(&bytes);
    }
    read_entry(archive, "collection.anki21").or_else(|| read_entry(archive, "collection.anki2"))
}

pub(super) fn read_entry(archive: &mut ZipArchive<Cursor<Vec<u8>>>, name: &str) -> Option<Vec<u8>> {
    let mut file = archive.by_name(name).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    Some(buf)
}

fn decode_zstd(bytes: &[u8]) -> Option<Vec<u8>> {
    let mut decoder = ruzstd::decoding::StreamingDecoder::new(bytes).ok()?;
    let mut out = Vec::new();
    decoder.read_to_end(&mut out).ok()?;
    Some(out)
}

/// The current format zstd-compresses files the legacy one stores as is.
pub(super) fn decode_if_zstd(bytes: Vec<u8>) -> Option<Vec<u8>> {
    if bytes.starts_with(ZSTD_MAGIC) {
        decode_zstd(&bytes)
    } else {
        Some(bytes)
    }
}
