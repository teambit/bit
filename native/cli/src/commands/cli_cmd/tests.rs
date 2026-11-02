//! Unit tests for `bit cli generate --docs` [`is_generate_docs`], [`parse_unknown_skill`], and [`render_docs_frontmatter`].
//!
//! Verifies `--docs`, `--metadata`, and `--skill` CLI flag combinations and YAML frontmatter rendering.

use super::{is_generate_docs, parse_unknown_skill, render_docs_frontmatter};

/// Verifies `bit cli generate --docs` flag parsing and YAML frontmatter rendering.
/// Covers `--docs`, `--metadata`, and `--skill` combinations as well as rejected `--json` flags.
#[test]
fn parses_cli_generate_docs_and_renders_frontmatter() {
    assert!(is_generate_docs(&["generate", "--docs"]));
    assert!(is_generate_docs(&["generate", "--docs", "--no-color", "--no-color=false"]));
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

/// Verifies that empty argument slices are rejected by [`is_generate_docs`] and return `None` from [`parse_unknown_skill`].
///
/// Ensures `bit cli` without subcommand arguments does not trigger doc generation.
#[test]
fn empty_args_are_not_generate_docs_and_have_no_unknown_skill() {
    assert!(!is_generate_docs(&[]));
    assert_eq!(parse_unknown_skill(&[]), None);
}
