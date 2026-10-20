use super::options::{Action, Options};
use std::ffi::OsString;

fn parse(words: &[&str]) -> Option<Options> {
    let args = words
        .iter()
        .map(OsString::from)
        .collect::<Vec<_>>();
    Options::parse(&args)
}

#[test]
fn parses_list_and_default_subcommand() {
    assert_eq!(
        parse(&["remote"]),
        Some(Options { command: "remote", action: Action::List, global: false }),
    );
    assert_eq!(
        parse(&["remote", "--global"]),
        Some(Options { command: "remote", action: Action::List, global: true }),
    );
    assert_eq!(
        parse(&["remote", "list", "-g"]),
        Some(Options { command: "list", action: Action::List, global: true }),
    );
}

#[test]
fn parses_add_and_del_subcommands() {
    assert_eq!(
        parse(&["remote", "add", "file:///tmp/scope", "--global"]),
        Some(Options {
            command: "add",
            action: Action::Add("file:///tmp/scope".to_owned()),
            global: true,
        }),
    );
    assert_eq!(
        parse(&["remote", "del", "my-scope"]),
        Some(Options { command: "del", action: Action::Del("my-scope".to_owned()), global: false }),
    );
}

#[test]
fn declines_unsupported_remote_arguments() {
    assert_eq!(parse(&["remote", "--help"]), None);
    assert_eq!(parse(&["remote", "add", "http://localhost:3000"]), None);
    assert_eq!(parse(&["remote", "add"]), None);
    assert_eq!(parse(&["remote", "del"]), None);
    assert_eq!(parse(&["remote", "unknown"]), None);
}
