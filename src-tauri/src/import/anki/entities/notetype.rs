use super::template::Template;

/// A note's type: its fields and the templates its cards are rendered from.
pub struct Notetype {
    pub name: String,
    pub is_cloze: bool,
    pub fields: Vec<String>,
    pub templates: Vec<Template>,
    /// Styles every card's template, which classes in its fields may rely on.
    pub css: String,
}
