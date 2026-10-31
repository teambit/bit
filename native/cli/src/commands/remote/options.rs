//! Narrow grammar of `RemoteCmd` and its `add`, `del`, and `list` subcommands.

use std::ffi::OsString;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Action {
    List,
    Add(String),
    Del(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub(super) command: &'static str,
    pub(super) action: Action,
    pub(super) global: bool,
}

impl Options {
    pub(super) fn parse(args: &[OsString]) -> Option<Self> {
        let tokens = args
            .iter()
            .skip(1)
            .map(|arg| arg.to_str())
            .collect::<Option<Vec<_>>>()?;
        let tokens = tokens
            .into_iter()
            .filter(|token| {
                !matches!(*token, "--no-color" | "--no-color=true" | "--no-color=false")
            })
            .collect::<Vec<_>>();
        let (command, rest) = split_subcommand(&tokens)?;
        let (global, values) = parse_flags_and_values(rest)?;
        let action = match (command, values.as_slice()) {
            ("remote" | "list", []) => Action::List,
            ("add", [url]) if valid_target(url) && url.starts_with("file://") => {
                Action::Add((*url).to_owned())
            }
            ("del", [name]) if valid_target(name) => Action::Del((*name).to_owned()),
            _ => return None,
        };
        Some(Self { command, action, global })
    }
}

fn split_subcommand<'a>(tokens: &'a [&'a str]) -> Option<(&'static str, &'a [&'a str])> {
    match tokens.split_first() {
        Some((&"list", rest)) => Some(("list", rest)),
        Some((&"add", rest)) => Some(("add", rest)),
        Some((&"del", rest)) => Some(("del", rest)),
        Some((arg, _)) if !arg.starts_with('-') => None,
        _ => Some(("remote", tokens)),
    }
}

fn parse_flags_and_values<'a>(tokens: &[&'a str]) -> Option<(bool, Vec<&'a str>)> {
    let mut global = false;
    let mut values = Vec::new();
    let mut iter = tokens.iter().copied();
    while let Some(token) = iter.next() {
        match token {
            "--" => {
                consume_trailing_values(iter, &mut values)?;
                break;
            }
            "-g" | "--global" | "--global=true" => global = true,
            "--global=false" => global = false,
            flag if flag.starts_with('-') => return None,
            value => values.push(value),
        }
    }
    Some((global, values))
}

fn consume_trailing_values<'a>(
    iter: impl Iterator<Item = &'a str>,
    values: &mut Vec<&'a str>,
) -> Option<()> {
    for rest in iter {
        if rest.starts_with('-') || rest.is_empty() {
            return None;
        }
        values.push(rest);
    }
    Some(())
}

fn valid_target(value: &str) -> bool {
    !value.is_empty() && value != "__proto__" && !value.contains(' ') && !value.contains('!')
}
