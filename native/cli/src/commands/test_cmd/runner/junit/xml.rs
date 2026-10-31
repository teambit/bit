use std::sync::LazyLock;

pub(super) fn attribute(value: &str) -> String {
    value
        .chars()
        .filter(|character| is_allowed_xml_char(*character))
        .collect::<String>()
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('"', "&quot;")
        .replace('\t', "&#x9;")
        .replace('\n', "&#xA;")
        .replace('\r', "&#xD;")
}
pub(super) fn strip_ansi(value: &str) -> String {
    if !value.contains(['\x1b', '\u{9b}']) {
        return value.to_owned();
    }
    static ANSI: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(concat!(
            r"[\x{1B}\x{9B}][\[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z[0-9]\/#&.:=?%@~_]+)*|",
            r"[a-zA-Z[0-9]]+(?:;[-a-zA-Z[0-9]\/#&.:=?%@~_]*)*)?\x07)|",
            r"(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[[0-9]A-PR-TZcf-ntqry=><~]))",
        ))
        .unwrap()
    });
    ANSI.replace_all(value, "").into_owned()
}

const fn is_allowed_xml_char(character: char) -> bool {
    matches!(character, '\t' | '\n' | '\r')
        || (character >= ' ' && !matches!(character, '\u{fffe}' | '\u{ffff}'))
}
