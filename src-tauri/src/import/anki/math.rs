use std::ops::Range;
use std::sync::LazyLock;

use base64::{Engine as _, engine::general_purpose};
use regex::{Captures, Regex};

use crate::import::epub::html_unescape;

use super::template::strip_html;

/// The editor's canonical equation markup (`equationElement.ts`), which its importer turns into equation nodes.
const EQUATION_ATTRIBUTE: &str = "data-lexical-equation";
const EQUATION_DISPLAY_ATTRIBUTE: &str = "data-lexical-equation-display";

/// MathJax's `\(…\)` and `\[…\]`, then the legacy LaTeX tags Anki renders to images.
static MATH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?is)\\\((.+?)\\\)|\\\[(.+?)\\\]|\[\$\](.+?)\[/\$\]|\[\$\$\](.+?)\[/\$\$\]|\[latex\](.+?)\[/latex\]",
    )
    .expect("valid math regex")
});
/// A `[latex]` body is LaTeX text, its math between dollars.
static DOLLARS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)\$\$(.+?)\$\$|\$(.+?)\$").expect("valid dollar regex"));
/// MathJax leaves code alone.
static CODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<pre\b.*?</pre>|<code\b.*?</code>").expect("valid code regex")
});
static LINE_BREAK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<br\s*/?>").expect("valid line break regex"));

/// Turns a card's math into equations, as Anki would typeset or render it.
pub fn convert_math(html: &str) -> String {
    let code: Vec<Range<usize>> = CODE.find_iter(html).map(|m| m.range()).collect();
    MATH.replace_all(html, |caps: &Captures| {
        let whole = caps.get(0).expect("match");
        let start = whole.start();
        // An escaped delimiter, a tag's attribute (a cloze's hidden text) or code stays as written.
        if html[..start].ends_with('\\')
            || is_inside_tag(html, start)
            || code.iter().any(|range| range.contains(&start))
        {
            return whole.as_str().to_string();
        }
        let converted = if let Some(math) = caps.get(1).or_else(|| caps.get(3)) {
            equation(math.as_str(), false)
        } else if let Some(math) = caps.get(2).or_else(|| caps.get(4)) {
            equation(math.as_str(), true)
        } else {
            latex_body(&caps[5])
        };
        converted.unwrap_or_else(|| whole.as_str().to_string())
    })
    .into_owned()
}

fn latex_body(body: &str) -> Option<String> {
    if !DOLLARS.is_match(body) {
        return equation(body, true);
    }
    let mut out = String::new();
    let mut last = 0;
    for caps in DOLLARS.captures_iter(body) {
        let whole = caps.get(0).expect("match");
        out.push_str(&body[last..whole.start()]);
        let converted = match caps.get(1) {
            Some(math) => equation(math.as_str(), true),
            None => equation(&caps[2], false),
        };
        out.push_str(&converted.unwrap_or_else(|| whole.as_str().to_string()));
        last = whole.end();
    }
    out.push_str(&body[last..]);
    Some(out)
}

/// Anki strips the markup a field's editor left inside math before typesetting it.
fn equation(html: &str, display: bool) -> Option<String> {
    let tex = html_unescape(&strip_html(&LINE_BREAK.replace_all(html, "\n")));
    let tex = tex.trim();
    if tex.is_empty() {
        return None;
    }
    let encoded = general_purpose::STANDARD.encode(tex);
    let display = if display {
        format!(" {EQUATION_DISPLAY_ATTRIBUTE}=\"true\"")
    } else {
        String::new()
    };
    Some(format!(
        "<span {EQUATION_ATTRIBUTE}=\"{encoded}\"{display}></span>"
    ))
}

fn is_inside_tag(html: &str, index: usize) -> bool {
    let before = &html[..index];
    before.rfind('<') > before.rfind('>')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn span(tex: &str, display: bool) -> String {
        equation(tex, display).unwrap()
    }

    #[test]
    fn convert_math_mathjax_delimiters_become_equations() {
        // Arrange

        let html = r"inline \(x^2\) and display \[\int_0^1 f\]";

        // Act

        let converted = convert_math(html);

        // Assert

        assert_eq!(
            format!(
                "inline {} and display {}",
                span("x^2", false),
                span(r"\int_0^1 f", true)
            ),
            converted
        );
    }

    #[test]
    fn convert_math_legacy_latex_tags_become_equations() {
        // Arrange

        let html = r"[$]\alpha[/$], [$$]\beta[/$$], [latex]angle $\theta$[/latex], [latex]\begin{align}a\end{align}[/latex]";

        // Act

        let converted = convert_math(html);

        // Assert

        assert_eq!(
            format!(
                "{}, {}, angle {}, {}",
                span(r"\alpha", false),
                span(r"\beta", true),
                span(r"\theta", false),
                span(r"\begin{align}a\end{align}", true)
            ),
            converted
        );
    }

    #[test]
    fn convert_math_field_markup_inside_math_is_stripped() {
        // Arrange

        let html = r"\(a &lt; <b>b</b><br>&amp; c\)";

        // Act

        let converted = convert_math(html);

        // Assert

        assert_eq!(span("a < b\n& c", false), converted);
    }

    #[test]
    fn convert_math_code_attributes_and_escapes_stay_as_written() {
        // Arrange

        let html = r#"<code>\(x\)</code><mark data-cloze-hidden="\(y\)">[...]</mark> \\(z\)"#;

        // Act

        let converted = convert_math(html);

        // Assert

        assert_eq!(html, converted);
    }
}
