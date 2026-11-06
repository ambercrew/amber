/// A note's fields, in its notetype's field order.
pub struct Note {
    pub notetype_id: i64,
    pub fields: Vec<String>,
    pub tags: Vec<String>,
}
