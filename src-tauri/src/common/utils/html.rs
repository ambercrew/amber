/// Escapes text placed between HTML tags.
pub fn escape_html_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Escapes text placed in a double-quoted HTML attribute.
pub fn escape_html_attribute(value: &str) -> String {
    escape_html_text(value).replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_html_attribute_markup_and_quotes_escaped() {
        // Arrange

        let value = r#"<a href="x">&</a>"#;

        // Act

        let actual = escape_html_attribute(value);

        // Assert

        assert_eq!("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;", actual);
    }

    #[test]
    fn escape_html_text_quotes_kept() {
        // Arrange

        let value = r#"say "hi" & <b>"#;

        // Act

        let actual = escape_html_text(value);

        // Assert

        assert_eq!(r#"say "hi" &amp; &lt;b&gt;"#, actual);
    }
}
