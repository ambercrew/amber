use std::collections::HashMap;
use std::sync::OnceLock;

use sqlx::{QueryBuilder, Sqlite};

use crate::infrastructure::repositories::sqlite::escape_like::escape_like;

/// Non-ASCII characters whose lowercase holds an ASCII letter, which `LIKE` never matches to it.
const FOLDS_TO_ASCII: [(char, char); 2] = [('\u{130}', 'i'), ('\u{212A}', 'k')];

/// One test a text column must pass to be worth reading.
enum Condition {
    /// `LIKE`, which ignores ASCII case and compares every other character exactly, plus
    /// the `FOLDS_TO_ASCII` characters that fold to one of the pattern's letters.
    Like {
        pattern: String,
        folds_to_query: Vec<char>,
    },
    /// Holds any of these exactly.
    ContainsAny(Vec<String>),
}

/// What a text column must satisfy to be worth reading; SQLite only folds ASCII case.
/// Every condition holds for each text the exact matcher would match, so none is left out.
pub struct TextPrefilter(Vec<Condition>);

impl TextPrefilter {
    pub fn new(query: &str, case_sensitive: bool) -> Self {
        if case_sensitive {
            return TextPrefilter(vec![Condition::ContainsAny(vec![query.to_string()])]);
        }
        let Some(cased) = query.chars().find(|&c| !folds_like_like(c)) else {
            return TextPrefilter(vec![like_condition(query)]);
        };
        // `LIKE` would miss other casings of a non-ASCII letter: it takes the longest stretch
        // without one, and the letter is looked for in every form that lowercases like it.
        let mut conditions = Vec::new();
        if let Some(run) = query
            .split(|c: char| !folds_like_like(c))
            .filter(|run| !run.trim().is_empty())
            .max_by_key(|run| run.chars().count())
        {
            conditions.push(like_condition(run));
        }
        conditions.push(Condition::ContainsAny(
            casings_of(cased).into_iter().map(String::from).collect(),
        ));
        TextPrefilter(conditions)
    }

    /// Pushes ` WHERE …` testing `column`; callers may follow it with `AND …`.
    pub fn push(&self, query_builder: &mut QueryBuilder<Sqlite>, column: &str) {
        query_builder.push(" WHERE ");
        for (index, condition) in self.0.iter().enumerate() {
            if index > 0 {
                query_builder.push(" AND ");
            }
            let (head, tests): (_, Vec<_>) = match condition {
                Condition::Like {
                    pattern,
                    folds_to_query,
                } => (
                    Some(pattern),
                    folds_to_query.iter().map(char::to_string).collect(),
                ),
                Condition::ContainsAny(needles) => (None, needles.clone()),
            };
            query_builder.push("(");
            let mut first = true;
            if let Some(pattern) = head {
                query_builder.push(format!("{column} LIKE "));
                query_builder.push_bind(pattern.clone());
                query_builder.push(" ESCAPE '\\'");
                first = false;
            }
            for needle in tests {
                if !first {
                    query_builder.push(" OR ");
                }
                query_builder.push(format!("instr({column}, "));
                query_builder.push_bind(needle);
                query_builder.push(") > 0");
                first = false;
            }
            query_builder.push(")");
        }
    }
}

fn like_condition(pattern: &str) -> Condition {
    let lowered = pattern.to_ascii_lowercase();
    Condition::Like {
        pattern: format!("%{}%", escape_like(pattern)),
        folds_to_query: FOLDS_TO_ASCII
            .iter()
            .filter(|(_, ascii)| lowered.contains(*ascii))
            .map(|(character, _)| *character)
            .collect(),
    }
}

/// Whether `LIKE` already treats every casing of `c` as the matcher does: ASCII, or uncased.
fn folds_like_like(c: char) -> bool {
    c.is_ascii() || !has_case(c)
}

fn has_case(c: char) -> bool {
    c.to_lowercase().ne(std::iter::once(c)) || c.to_uppercase().ne(std::iter::once(c))
}

/// Every character a text can hold where the query has `c`: those whose lowercase holds `c`'s.
fn casings_of(c: char) -> Vec<char> {
    let lowered = c.to_lowercase().next().unwrap_or(c);
    // Whole-text lowercasing turns a word-final capital sigma into ς, not σ.
    if matches!(lowered, 'σ' | 'ς') {
        return vec!['σ', 'ς', 'Σ'];
    }
    let mut casings = vec![lowered];
    casings.extend(
        lowercase_sources()
            .get(&lowered)
            .into_iter()
            .flatten()
            .copied(),
    );
    casings
}

/// For each character, the others whose lowercase holds it (e.g. Ω and the ohm sign for ω).
fn lowercase_sources() -> &'static HashMap<char, Vec<char>> {
    static SOURCES: OnceLock<HashMap<char, Vec<char>>> = OnceLock::new();
    SOURCES.get_or_init(|| {
        let mut sources: HashMap<char, Vec<char>> = HashMap::new();
        for source in (0..=char::MAX as u32).filter_map(char::from_u32) {
            for lowered in source.to_lowercase().filter(|&lowered| lowered != source) {
                sources.entry(lowered).or_default().push(source);
            }
        }
        sources
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_to_ascii_every_char_lowercasing_to_ascii_is_listed() {
        // Arrange

        let expected: Vec<char> = FOLDS_TO_ASCII.iter().map(|(c, _)| *c).collect();

        // Act

        let actual: Vec<char> = (0..=char::MAX as u32)
            .filter_map(char::from_u32)
            .filter(|c| !c.is_ascii() && c.to_lowercase().any(|l| l.is_ascii()))
            .collect();

        // Assert

        assert_eq!(expected, actual);
    }
}
