use super::{is_generate_docs, parse_unknown_skill, render_docs_frontmatter};

#[test]
fn parses_cli_generate_docs_and_renders_frontmatter() {
    assert!(is_generate_docs(&["generate", "--docs"]));
    assert!(is_generate_docs(&["generate", "--docs", "--no-color"]));
    assert!(is_generate_docs(&["generate", "--docs", "--metadata.id=cli"]));
    assert!(is_generate_docs(&["generate", "--metadata", "--docs"]));
    assert!(is_generate_docs(&["generate", "-dm"]));
    assert!(is_generate_docs(&["generate", "-md"]));
    assert!(is_generate_docs(&["generate", "--docs", "--skill", "commands"]));
    assert!(is_generate_docs(&["generate", "--docs", "--skill=reference"]));
    assert!(!is_generate_docs(&["generate"]));
    assert!(!is_generate_docs(&["generate", "--docs", "--json"]));
    assert!(!is_generate_docs(&["generate", "--docs", "--skill"]));
    assert_eq!(parse_unknown_skill(&["generate", "--skill", "foo"]), Some("foo"));
    assert_eq!(parse_unknown_skill(&["generate", "--skill=bar"]), Some("bar"));
    assert_eq!(parse_unknown_skill(&["generate", "--skill", "commands"]), None);
    assert_eq!(parse_unknown_skill(&["generate", "--docs", "--skill", "foo"]), None);
    assert_eq!(
        render_docs_frontmatter("1.2.3"),
        "---\ndescription: 'Bit command synopses. Bit version: 1.2.3'\nlabels: ['cli', 'mdx', 'docs']\n---",
    );
}
