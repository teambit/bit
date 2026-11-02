//! XML character filtering and attribute escaping for `JUnit` reports.
//!
//! [`attribute`] and [`strip_ansi`] filter invalid XML codepoints and escape entity characters.
use std::sync::LazyLock;

/// Filters disallowed XML 1.0 characters and escapes XML attribute entities in `value`.
#[inline]
pub(super) fn attribute(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for character in value.chars().filter(|character| is_allowed_xml_char(*character)) {
        match character {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\t' => out.push_str("&#x9;"),
            '\n' => out.push_str("&#xA;"),
            '\r' => out.push_str("&#xD;"),
            other => out.push(other),
        }
    }
    out
}
#[inline]
pub(super) fn strip_ansi(value: &str) -> std::borrow::Cow<'_, str> {
    if !value.contains(['\x1b', '\u{9b}']) {
        return std::borrow::Cow::Borrowed(value);
    }
    static ANSI: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(concat!(
            r"[\x{1B}\x{9B}][\[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z[0-9]\/#&.:=?%@~_]+)*|",
            r"[a-zA-Z[0-9]]+(?:;[-a-zA-Z[0-9]\/#&.:=?%@~_]*)*)?\x07)|",
            r"(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[[0-9]A-PR-TZcf-ntqry=><~]))",
        ))
        .unwrap()
    });
    ANSI.replace_all(value, "")
}

#[inline]
const fn is_allowed_xml_char(character: char) -> bool {
    matches!(character, '\t' | '\n' | '\r')
        || (character >= ' '
            && !matches!(character, '\u{7f}'..='\u{9f}' | '\u{fdd0}'..='\u{fdef}')
            && (character as u32) & 0xfffe != 0xfffe)
}
