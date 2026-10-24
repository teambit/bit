use super::{GenerateOptions, ServeOptions, parse_generate_options, parse_serve_options};

#[test]
fn parses_generate_and_serve_preview_options() {
    assert_eq!(
        parse_generate_options(&["ui/*", "-n", "compositions"]),
        Some(GenerateOptions { pattern: Some("ui/*".into()), name: Some("compositions".into()) }),
    );
    assert_eq!(parse_serve_options(&["-p", "3300"]), Some(ServeOptions { port: Some(3300) }));
    assert_eq!(parse_serve_options(&["--port=abc"]), None);
}
