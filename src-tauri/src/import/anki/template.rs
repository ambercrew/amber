use std::collections::HashMap;
use std::ops::Range;
use std::sync::LazyLock;

use regex::Regex;

use crate::common::utils::html::escape_html_attribute;
use crate::import::epub::html_unescape;

/// Mark a cloze's answers on the back, so a divider cutting the back above them can keep them.
const ANSWERS_START: char = '\u{E000}';
const ANSWERS_END: char = '\u{E001}';

/// What the front shows in place of a hidden cloze without a hint, as the editor's cloze does.
const CLOZE_PLACEHOLDER: &str = "[...]";

static TAG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<[^>]*>").expect("valid tag regex"));
static ANSWER_DIVIDER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)<hr[^>]*\bid\s*=\s*["']?answer["']?[^>]*>"#).expect("valid divider regex")
});
/// A plain `<hr>`, some templates' divider when they repeat the question without Anki's `id=answer`.
static DIVIDER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<hr\b[^>]*>").expect("valid divider regex"));
static CLOZE_START: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\{\{c(\d+)::").expect("valid cloze regex"));
static FURIGANA: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r" ?([^ >\[]+?)\[([^\]]+)\]").expect("valid furigana regex"));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Question,
    Answer,
}

/// Everything a card's templates can reference.
pub struct CardContext<'a> {
    pub fields: HashMap<&'a str, &'a str>,
    pub tags: &'a [String],
    pub deck: &'a [String],
    pub card_name: &'a str,
    pub notetype_name: &'a str,
    /// The 1-based cloze number this card tests, for cloze notetypes.
    pub cloze_ord: Option<u32>,
}

/// The card's front and back, the back without the front repeated above its answer.
pub fn render_card(question: &str, answer: &str, context: &CardContext) -> (String, String) {
    let front = render(question, context, Side::Question);
    let back = render(answer, context, Side::Answer);
    let divider = ANSWER_DIVIDER
        .find(&back)
        .map(|divider| divider.range())
        .or_else(|| repeated_front_divider(&front, &back));
    let back = match divider {
        // A cloze's answers above the divider are what the back reveals, e.g. `{{cloze:Text}}<hr id=answer>`.
        Some(divider) => {
            let answers = marked_answers(&back[..divider.start]);
            let rest = &back[divider.end..];
            match (answers.is_empty(), rest.trim().is_empty()) {
                (true, _) => rest.to_string(),
                (false, true) => answers,
                (false, false) => format!("{answers}<br>{rest}"),
            }
        }
        None => back,
    };
    let unmark = |side: &str| {
        side.replace([ANSWERS_START, ANSWERS_END], "")
            .trim()
            .to_string()
    };
    (unmark(&front), unmark(&back))
}

/// The first `<hr>` that only the front's content precedes, as templates repeating it without `id=answer` have.
fn repeated_front_divider(front: &str, back: &str) -> Option<Range<usize>> {
    let front_text = squash(&strip_html(front));
    if front_text.is_empty() {
        return None;
    }
    DIVIDER
        .find_iter(back)
        .find(|divider| squash(&strip_html(&back[..divider.start()])) == front_text)
        .map(|divider| divider.range())
}

fn marked_answers(html: &str) -> String {
    html.split(ANSWERS_START)
        .skip(1)
        .filter_map(|part| part.split_once(ANSWERS_END).map(|(answers, _)| answers))
        .filter(|answers| !answers.trim().is_empty())
        .collect::<Vec<_>>()
        .join("<br>")
}

fn squash(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn strip_html(html: &str) -> String {
    let text = TAG.replace_all(html, "");
    text.replace("&nbsp;", " ")
}

pub fn is_blank(html: &str) -> bool {
    !html.contains("<img") && strip_html(html).trim().is_empty()
}

enum Node<'a> {
    Text(&'a str),
    Replacement {
        key: &'a str,
        filters: Vec<&'a str>,
    },
    Section {
        key: &'a str,
        inverted: bool,
        children: Vec<Node<'a>>,
    },
}

fn render(template: &str, context: &CardContext, side: Side) -> String {
    let mut out = String::new();
    render_nodes(&parse(template), context, side, &mut out);
    out
}

fn parse(template: &str) -> Vec<Node<'_>> {
    // Each frame is an open section's key, inversion and children so far; the root has no key.
    let mut stack: Vec<(&str, bool, Vec<Node>)> = vec![("", false, Vec::new())];
    let mut rest = template;

    while let Some(start) = rest.find("{{") {
        let Some(len) = rest[start + 2..].find("}}") else {
            break;
        };
        if start > 0 {
            stack.last_mut().unwrap().2.push(Node::Text(&rest[..start]));
        }
        let tag = rest[start + 2..start + 2 + len].trim();
        rest = &rest[start + 2 + len + 2..];

        if let Some(key) = tag.strip_prefix('#') {
            stack.push((key.trim(), false, Vec::new()));
        } else if let Some(key) = tag.strip_prefix('^') {
            stack.push((key.trim(), true, Vec::new()));
        } else if tag.starts_with('/') {
            close_section(&mut stack);
        } else if !tag.starts_with('!') {
            let mut parts: Vec<&str> = tag.split(':').map(str::trim).collect();
            let key = parts.pop().unwrap_or_default();
            stack.last_mut().unwrap().2.push(Node::Replacement {
                key,
                filters: parts,
            });
        }
    }
    if !rest.is_empty() {
        stack.last_mut().unwrap().2.push(Node::Text(rest));
    }
    // Unclosed sections end with the template.
    while stack.len() > 1 {
        close_section(&mut stack);
    }
    stack.pop().unwrap().2
}

fn close_section<'a>(stack: &mut Vec<(&'a str, bool, Vec<Node<'a>>)>) {
    if stack.len() < 2 {
        return;
    }
    let (key, inverted, children) = stack.pop().unwrap();
    stack.last_mut().unwrap().2.push(Node::Section {
        key,
        inverted,
        children,
    });
}

fn render_nodes(nodes: &[Node], context: &CardContext, side: Side, out: &mut String) {
    for node in nodes {
        match node {
            Node::Text(text) => out.push_str(text),
            Node::Replacement { key, filters } => {
                out.push_str(&replacement(key, filters, context, side));
            }
            Node::Section {
                key,
                inverted,
                children,
            } => {
                let present = field(context, key).is_some_and(|value| !is_blank(value));
                if present != *inverted {
                    render_nodes(children, context, side, out);
                }
            }
        }
    }
}

fn field<'a>(context: &CardContext<'a>, key: &str) -> Option<&'a str> {
    context.fields.get(key).copied().or_else(|| {
        context
            .fields
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(key))
            .map(|(_, value)| *value)
    })
}

fn replacement(key: &str, filters: &[&str], context: &CardContext, side: Side) -> String {
    let mut value = match key {
        // The back is cut to what follows the answer divider, so the front needn't repeat.
        "FrontSide" => String::new(),
        "Tags" => context.tags.join(" "),
        "Deck" => context.deck.join("::"),
        "Subdeck" => context.deck.last().cloned().unwrap_or_default(),
        "Card" => context.card_name.to_string(),
        "Type" => context.notetype_name.to_string(),
        _ => field(context, key).unwrap_or_default().to_string(),
    };
    let tests_cloze = filters.contains(&"cloze");
    let cloze_ord = context.cloze_ord.unwrap_or(1);

    // Anki applies filters right to left.
    for filter in filters.iter().rev() {
        value = match *filter {
            "text" => strip_html(&value),
            "cloze" if side == Side::Answer => marked(cloze_answers(&value, cloze_ord)),
            "cloze" => render_question_parts(&parse_clozes(&value), cloze_ord),
            "cloze-only" => marked(cloze_answers(&value, cloze_ord)),
            // Typing has no counterpart; the back shows the expected answer instead.
            "type" if side == Side::Answer && !tests_cloze => value,
            "type" => String::new(),
            "kanji" => FURIGANA.replace_all(&value, "$1").into_owned(),
            "kana" => FURIGANA.replace_all(&value, "$2").into_owned(),
            "furigana" => FURIGANA
                .replace_all(&value, "<ruby>$1<rt>$2</rt></ruby>")
                .into_owned(),
            tts if tts.starts_with("tts") => String::new(),
            _ => value,
        };
    }
    value
}

#[derive(Debug, PartialEq)]
enum ClozePart {
    Text(String),
    Cloze {
        ord: u32,
        children: Vec<ClozePart>,
        hint: Option<String>,
    },
}

fn parse_clozes(text: &str) -> Vec<ClozePart> {
    // Each frame is an open cloze's number and children so far; the root has none.
    let mut stack: Vec<(Option<u32>, Vec<ClozePart>)> = vec![(None, Vec::new())];
    let mut buffer = String::new();
    let mut i = 0;

    while i < text.len() {
        let rest = &text[i..];
        if let Some(caps) = CLOZE_START.captures(rest) {
            flush_text(&mut buffer, &mut stack);
            stack.push((caps[1].parse().ok(), Vec::new()));
            i += caps[0].len();
        } else if rest.starts_with("}}") && stack.len() > 1 {
            flush_text(&mut buffer, &mut stack);
            let (ord, mut children) = stack.pop().unwrap();
            let hint = split_hint(&mut children);
            stack.last_mut().unwrap().1.push(ClozePart::Cloze {
                ord: ord.unwrap_or(1),
                children,
                hint,
            });
            i += 2;
        } else {
            let ch = rest.chars().next().unwrap();
            buffer.push(ch);
            i += ch.len_utf8();
        }
    }
    flush_text(&mut buffer, &mut stack);
    // Unclosed clozes are kept as written.
    while stack.len() > 1 {
        let (ord, children) = stack.pop().unwrap();
        let parent = &mut stack.last_mut().unwrap().1;
        parent.push(ClozePart::Text(format!("{{{{c{}::", ord.unwrap_or(1))));
        parent.extend(children);
    }
    stack.pop().unwrap().1
}

fn flush_text(buffer: &mut String, stack: &mut [(Option<u32>, Vec<ClozePart>)]) {
    if !buffer.is_empty() {
        let parts = &mut stack.last_mut().unwrap().1;
        parts.push(ClozePart::Text(std::mem::take(buffer)));
    }
}

/// Splits `answer::hint` off the cloze's last top-level text.
fn split_hint(children: &mut [ClozePart]) -> Option<String> {
    let Some(ClozePart::Text(last)) = children.last_mut() else {
        return None;
    };
    let index = last.rfind("::")?;
    let hint = last[index + 2..].to_string();
    last.truncate(index);
    Some(hint)
}

fn render_question_parts(parts: &[ClozePart], ord: u32) -> String {
    let mut out = String::new();
    for part in parts {
        match part {
            ClozePart::Text(text) => out.push_str(text),
            ClozePart::Cloze {
                ord: part_ord,
                children,
                hint,
            } if *part_ord == ord => {
                let hidden = html_unescape(strip_html(&revealed(children)).trim());
                let placeholder = hint
                    .as_deref()
                    .map(|hint| {
                        format!(
                            "[{}]",
                            escape_html_attribute(&html_unescape(strip_html(hint).trim()))
                        )
                    })
                    .unwrap_or_else(|| CLOZE_PLACEHOLDER.to_string());
                out.push_str(&format!(
                    "<mark data-cloze-hidden=\"{}\">{placeholder}</mark>",
                    escape_html_attribute(&hidden)
                ));
            }
            ClozePart::Cloze { children, .. } => {
                out.push_str(&render_question_parts(children, ord))
            }
        }
    }
    out
}

/// A cloze's content with every nested cloze shown.
fn revealed(parts: &[ClozePart]) -> String {
    parts
        .iter()
        .map(|part| match part {
            ClozePart::Text(text) => text.clone(),
            ClozePart::Cloze { children, .. } => revealed(children),
        })
        .collect()
}

/// What the card's cloze hides, each occurrence of its number joined.
fn cloze_answers(text: &str, ord: u32) -> String {
    let mut answers = Vec::new();
    collect_answers(&parse_clozes(text), ord, &mut answers);
    answers.join(", ")
}

fn collect_answers(parts: &[ClozePart], ord: u32, answers: &mut Vec<String>) {
    for part in parts {
        if let ClozePart::Cloze {
            ord: part_ord,
            children,
            ..
        } = part
        {
            if *part_ord == ord {
                answers.push(revealed(children));
            } else {
                collect_answers(children, ord, answers);
            }
        }
    }
}

fn marked(answers: String) -> String {
    format!("{ANSWERS_START}{answers}{ANSWERS_END}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context<'a>(fields: &[(&'a str, &'a str)], cloze_ord: Option<u32>) -> CardContext<'a> {
        CardContext {
            fields: fields.iter().copied().collect(),
            tags: &[],
            deck: &[],
            card_name: "Card 1",
            notetype_name: "Basic",
            cloze_ord,
        }
    }

    #[test]
    fn render_card_basic_template_back_omits_front_side() {
        // Arrange

        let context = context(&[("Front", "hola"), ("Back", "hello")], None);

        // Act

        let (front, back) = render_card(
            "{{Front}}",
            "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
            &context,
        );

        // Assert

        assert_eq!("hola", front);
        assert_eq!("hello", back);
    }

    #[test]
    fn render_card_back_repeating_front_keeps_only_answer() {
        // Arrange

        let context = context(&[("Front", "hola"), ("Back", "hello")], None);

        // Act

        let (front, back) = render_card(
            "{{Front}}\n{{type:Back}}",
            "{{Front}}<hr id=\"answer\">{{type:Back}}",
            &context,
        );

        // Assert

        assert_eq!("hola", front);
        assert_eq!("hello", back);
    }

    #[test]
    fn render_card_back_repeating_front_before_plain_divider_keeps_only_answer() {
        // Arrange

        let context = context(&[("Question", "<p>Why?</p>"), ("Answer", "Because")], None);

        // Act

        let (_, back) = render_card(
            "<div class=\"card\">{{Question}}</div>",
            "<div class=\"card\">{{Question}}<hr><div>{{Answer}}</div></div>",
            &context,
        );

        // Assert

        assert_eq!("<div>Because</div></div>", back);
    }

    #[test]
    fn render_card_plain_divider_after_other_content_is_kept() {
        // Arrange

        let context = context(&[("Front", "Why?"), ("Back", "Because")], None);

        // Act

        let (_, back) = render_card("{{Front}}", "{{Back}}<hr>Notes", &context);

        // Assert

        assert_eq!("Because<hr>Notes", back);
    }

    #[test]
    fn render_card_sections_render_by_field_presence() {
        // Arrange

        let context = context(&[("Front", "hola"), ("Hint", "")], None);

        // Act

        let (front, _) = render_card(
            "{{Front}}{{#Hint}} ({{Hint}}){{/Hint}}{{^Hint}}!{{/Hint}}",
            "",
            &context,
        );

        // Assert

        assert_eq!("hola!", front);
    }

    #[test]
    fn render_card_cloze_hides_only_current_number() {
        // Arrange

        let text = "{{c1::Madrid}} is in {{c2::Spain::country}}";
        let context = context(&[("Text", text), ("Back Extra", "capital")], Some(2));

        // Act

        let (front, back) = render_card(
            "{{cloze:Text}}",
            "{{cloze:Text}}<br>{{Back Extra}}",
            &context,
        );

        // Assert

        assert_eq!(
            "Madrid is in <mark data-cloze-hidden=\"Spain\">[country]</mark>",
            front
        );
        assert_eq!("Spain<br>capital", back);
    }

    #[test]
    fn render_card_cloze_above_answer_divider_keeps_answers_on_back() {
        // Arrange

        let context = context(
            &[("Text", "x &lt;- {{c1::a &lt; 1}}"), ("Extra", "")],
            Some(1),
        );

        // Act

        let (front, back) = render_card(
            "{{cloze:Text}}",
            "{{cloze:Text}}<hr id=answer>{{Extra}}",
            &context,
        );

        // Assert

        assert_eq!(
            "x &lt;- <mark data-cloze-hidden=\"a &lt; 1\">[...]</mark>",
            front
        );
        assert_eq!("a &lt; 1", back);
    }

    #[test]
    fn render_card_nested_cloze_hides_outer_with_inner_revealed() {
        // Arrange

        let context = context(&[("Text", "{{c1::a {{c2::b}} c}}")], Some(1));

        // Act

        let (front, back) = render_card("{{cloze:Text}}", "{{cloze:Text}}", &context);

        // Assert

        assert_eq!("<mark data-cloze-hidden=\"a b c\">[...]</mark>", front);
        assert_eq!("a b c", back);
    }

    #[test]
    fn render_card_comments_and_tts_render_nothing() {
        // Arrange

        let context = context(&[("Front", "hola")], None);

        // Act

        let (front, _) = render_card("{{! note }}{{tts es_ES:Front}}{{text:Front}}", "", &context);

        // Assert

        assert_eq!("hola", front);
    }

    #[test]
    fn is_blank_only_whitespace_markup_returns_true() {
        // Arrange

        let html = "<div>&nbsp;<br></div>";

        // Act

        let blank = is_blank(html);

        // Assert

        assert!(blank);
    }
}
