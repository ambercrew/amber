/// The notetypes Amber's notes use in Anki.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnkiNotetype {
    /// Fields: Front, Back.
    Basic,
    /// Fields: Occlusion, Image, Header, Back Extra, Comments; a card per cloze.
    ImageOcclusion,
}

impl AnkiNotetype {
    /// The notetype's id in the exported collection.
    pub fn id(self) -> i64 {
        match self {
            Self::Basic => 1_793_750_400_001,
            Self::ImageOcclusion => 1_793_750_400_002,
        }
    }

    /// Its key in `stock.json`, and the name Anki shows.
    pub fn definition(self) -> (&'static str, &'static str) {
        match self {
            Self::Basic => ("basic", "Amber Basic"),
            Self::ImageOcclusion => ("imageOcclusion", "Amber Image Occlusion"),
        }
    }
}
