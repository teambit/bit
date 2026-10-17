use super::{detect_indent, detect_newline};

#[test]
fn detects_indentation_like_detect_indent() {
    assert_eq!(detect_indent("{\n  \"a\": {\n    \"b\": 1\n  }\n}\n"), "  ");
    assert_eq!(detect_indent("{\n    \"a\": 1,\n    \"b\": 2\n}"), "    ");
    assert_eq!(detect_indent("{\n\t\"a\": {\n\t\t\"b\": 1\n\t}\n}"), "\t");
    assert_eq!(detect_indent(r#"{"a":1}"#), "");
    // The step most lines follow wins a tie of uses.
    assert_eq!(detect_indent("a\n  b\n  c\n  d\n      e\nf\n"), "  ");
}

#[test]
fn detects_newlines_like_detect_newline() {
    assert_eq!(detect_newline("{}"), None);
    assert_eq!(detect_newline("{\r\n}\r\n"), Some("\r\n"));
    assert_eq!(detect_newline("{\r\n}\n\n"), Some("\n"));
}
