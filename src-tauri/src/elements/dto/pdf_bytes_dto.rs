use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfBytesDto {
    pub bytes_base64: String,
}
