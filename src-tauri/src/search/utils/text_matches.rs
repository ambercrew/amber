use std::ops::Range;

/// Characters of a match's line a snippet keeps on each side of it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SnippetWindow {
    pub before: usize,
    pub after: usize,
}

/// The global search's, sized for one row: little before the match, the line after cut much later.
pub const SEARCH_RESULT_WINDOW: SnippetWindow = SnippetWindow {
    before: 24,
    after: 120,
};

/// A match with the rest of its line around it, as the global search lists it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snippet {
    pub before: String,
    pub text: String,
    pub after: String,
}

/// Byte ranges of every occurrence of `query` in `text`, overlapping and
/// case-folded the way the frontend's find in page counts them (`findMatches.ts`).
pub fn find_matches(text: &str, query: &str, case_sensitive: bool) -> Vec<Range<usize>> {
    if query.is_empty() {
        return Vec::new();
    }
    if case_sensitive {
        return overlapping_matches(text, query, |range| range);
    }

    let needle = query.to_lowercase();
    if text.is_ascii() {
        // ASCII folding keeps every byte offset, so no mapping back is needed.
        return overlapping_matches(&text.to_ascii_lowercase(), &needle, |range| range);
    }
    let folded = FoldedText::new(text);
    overlapping_matches(&folded.text, &needle, |range| folded.original_range(range))
}

fn overlapping_matches(
    haystack: &str,
    needle: &str,
    to_original: impl Fn(Range<usize>) -> Range<usize>,
) -> Vec<Range<usize>> {
    let mut matches = Vec::new();
    let mut from = 0;
    while let Some(offset) = haystack[from..].find(needle) {
        let start = from + offset;
        matches.push(to_original(start..start + needle.len()));
        // One character on, not past the match, so matches may overlap.
        from = start + haystack[start..].chars().next().map_or(1, char::len_utf8);
    }
    matches
}

/// Lowercased text that remembers which original character each byte came from,
/// as lowercasing can change a character's byte length.
struct FoldedText<'a> {
    original: &'a str,
    text: String,
    origins: Vec<u32>,
}

impl<'a> FoldedText<'a> {
    fn new(original: &'a str) -> Self {
        // Whole-string lowercasing applies final sigma like JS; per character, only lengths match it.
        let text = original.to_lowercase();
        let mut origins = Vec::with_capacity(text.len());
        for (index, character) in original.char_indices() {
            let folded_len: usize = character.to_lowercase().map(char::len_utf8).sum();
            origins.resize(origins.len() + folded_len, index as u32);
        }
        debug_assert_eq!(text.len(), origins.len());
        Self {
            original,
            text,
            origins,
        }
    }

    fn original_range(&self, range: Range<usize>) -> Range<usize> {
        let start = self.origins[range.start] as usize;
        let last = self.origins[range.end - 1] as usize;
        let end = last
            + self.original[last..]
                .chars()
                .next()
                .map_or(0, char::len_utf8);
        start..end
    }
}

/// The match in `range` with up to a line's worth of `text` around it.
pub fn snippet(text: &str, range: Range<usize>, window: SnippetWindow) -> Snippet {
    let line_start = text[..range.start].rfind('\n').map_or(0, |index| index + 1);
    let line_end = text[range.end..]
        .find('\n')
        .map_or(text.len(), |index| range.end + index);

    let before_line = text[line_start..range.start].trim_start();
    let before_chars = before_line.chars().count();
    let before = if before_chars > window.before {
        let skipped: usize = before_line
            .chars()
            .take(before_chars - window.before)
            .map(char::len_utf8)
            .sum();
        format!("…{}", before_line[skipped..].trim_start())
    } else {
        before_line.to_string()
    };

    let after_line = text[range.end..line_end].trim_end();
    let after = if after_line.chars().count() > window.after {
        let kept: String = after_line.chars().take(window.after).collect();
        format!("{}…", kept.trim_end())
    } else {
        after_line.to_string()
    };

    Snippet {
        before,
        text: text[range].to_string(),
        after,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_matches_case_insensitive_finds_every_casing() {
        // Arrange

        let text = "Rust and rust and RUST";

        // Act

        let actual = find_matches(text, "rust", false);

        // Assert

        assert_eq!(vec![0..4, 9..13, 18..22], actual);
    }

    #[test]
    fn find_matches_case_sensitive_skips_other_casings() {
        // Arrange

        let text = "Rust and rust";

        // Act

        let actual = find_matches(text, "rust", true);

        // Assert

        assert_eq!(vec![9..13], actual);
    }

    #[test]
    fn find_matches_middle_of_word_matches_substring() {
        // Arrange

        let text = "photosynthesis";

        // Act

        let actual = find_matches(text, "synth", false);

        // Assert

        assert_eq!(vec![5..10], actual);
    }

    #[test]
    fn find_matches_repeated_characters_returns_overlapping_matches() {
        // Arrange

        let text = "aaa";

        // Act

        let actual = find_matches(text, "aa", false);

        // Assert

        assert_eq!(vec![0..2, 1..3], actual);
    }

    #[test]
    fn find_matches_non_ascii_text_returns_original_byte_ranges() {
        // Arrange

        // "İ" lowercases to two characters, shifting every later byte.
        let text = "İstanbul Ürün";

        // Act

        let actual = find_matches(text, "ürün", false);

        // Assert

        assert_eq!(1, actual.len());
        assert_eq!("Ürün", &text[actual[0].clone()]);
    }

    #[test]
    fn find_matches_word_final_sigma_matches_final_sigma_query() {
        // Arrange

        let text = "ΛΟΓΟΣ και";

        // Act

        let actual = find_matches(text, "λογος", false);

        // Assert

        assert_eq!(vec![0..10], actual);
    }

    #[test]
    fn find_matches_empty_query_returns_nothing() {
        // Arrange

        let text = "anything";

        // Act

        let actual = find_matches(text, "", false);

        // Assert

        assert!(actual.is_empty());
    }

    #[test]
    fn snippet_match_in_later_line_keeps_only_its_line() {
        // Arrange

        let text = "first line\nthe needle here\nlast line";
        let range = find_matches(text, "needle", false)[0].clone();

        // Act

        let actual = snippet(text, range, SEARCH_RESULT_WINDOW);

        // Assert

        assert_eq!(
            Snippet {
                before: "the ".into(),
                text: "needle".into(),
                after: " here".into(),
            },
            actual
        );
    }

    #[test]
    fn snippet_long_text_before_match_cuts_it_with_ellipsis() {
        // Arrange

        let text = format!("{} needle", "word ".repeat(20));
        let range = find_matches(&text, "needle", false)[0].clone();

        // Act

        let actual = snippet(&text, range, SEARCH_RESULT_WINDOW);

        // Assert

        assert!(actual.before.starts_with('…'));
        assert!(actual.before.chars().count() <= SEARCH_RESULT_WINDOW.before + 1);
    }

    #[test]
    fn snippet_long_text_after_match_cuts_it_with_ellipsis() {
        // Arrange

        let text = format!("needle {}", "word ".repeat(10));
        let range = find_matches(&text, "needle", false)[0].clone();
        let window = SnippetWindow {
            before: 10,
            after: 12,
        };

        // Act

        let actual = snippet(&text, range, window);

        // Assert

        assert_eq!(" word word w…", actual.after);
    }

    #[test]
    fn snippet_text_within_window_keeps_it_whole() {
        // Arrange

        let text = "a short needle line";
        let range = find_matches(text, "needle", false)[0].clone();
        let window = SnippetWindow {
            before: 300,
            after: 300,
        };

        // Act

        let actual = snippet(text, range, window);

        // Assert

        assert_eq!(
            Snippet {
                before: "a short ".into(),
                text: "needle".into(),
                after: " line".into(),
            },
            actual
        );
    }
}
