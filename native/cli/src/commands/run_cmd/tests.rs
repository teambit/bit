use super::{Options, parse_options};

#[test]
fn parses_run_options() {
    assert_eq!(
        parse_options(&["my-app", "-d", "-p", "4000", "-w", "-n", "--args", "--flag"]),
        Some(Options {
            app_name: Some("my-app".into()),
            dev: true,
            port: Some("4000".into()),
            verbose: false,
            watch: true,
            no_browser: true,
            args: Some("--flag".into()),
        }),
    );
}
