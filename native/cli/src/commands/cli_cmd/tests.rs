use super::{is_generate_docs, render_docs_frontmatter};

#[test]
fn parses_cli_generate_docs_and_renders_frontmatter() {
    assert!(is_generate_docs(&["generate", "--docs"]));
    assert!(is_generate_docs(&["generate", "--docs", "--no-color"]));
    assert!(!is_generate_docs(&["generate"]));
    assert!(!is_generate_docs(&["generate", "--docs", "--json"]));
    assert_eq!(
        render_docs_frontmatter("1.2.3"),
        "---\ndescription: 'Bit command synopses. Bit version: 1.2.3'\nlabels: ['cli', 'mdx', 'docs']\n---",
    );
}
