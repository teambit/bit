use super::{Options, parse_options};

#[test]
fn parses_and_validates_server_port() {
    assert_eq!(parse_options(&[]), Some(Options { port: None, compile: false }));
    assert_eq!(
        parse_options(&["-p", "3000", "--compile"]),
        Some(Options { port: Some(3000), compile: true }),
    );
    assert_eq!(parse_options(&["--port=invalid"]), None);
}
