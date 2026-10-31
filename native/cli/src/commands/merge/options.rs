//! The native merge grammar: the unambiguous subset of
//! `bit merge [component-pattern]` that native planning accepts.

use serde_json::{Value, json};

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Options {
    pub pattern: Option<String>,
    /// `--auto-merge-resolve <ours|theirs|manual>`, or `--manual`.
    pub strategy: Option<String>,
    pub no_snap: bool,
    pub message: Option<String>,
    pub verbose: bool,
    pub skip_install: bool,
}

const BOOLEAN: [&str; 4] = ["--skip-dependency-installation", "--manual", "--verbose", "--no-snap"];
const VALUED: [&str; 2] = ["--auto-merge-resolve", "--message"];

/// When `args` fails validation in `MergeCmd.report`, return the error message.
pub fn validate_error(args: &[&str]) -> Option<&'static str> {
    let mut flags: Vec<(&str, Value)> = Vec::new();
    let mut positionals = 0usize;
    let mut index = 0;
    while index < args.len() {
        let arg = alias(args[index]);
        index += 1;
        if arg == "--" {
            positionals += count_trailing_positionals(&args[index..])?;
            break;
        }
        if matches!(
            arg,
            "--no-color"
                | "--no-color=true"
                | "--no-color=false"
                | "--build"
                | "--build=true"
                | "--build=false",
        ) {
            continue;
        }
        if !arg.starts_with('-') {
            positionals += 1;
            continue;
        }
        index += apply_validate_flag(&mut flags, arg, args.get(index).copied())?;
    }
    (positionals <= 1).then(|| check_merge_flags(&flags)).flatten()
}

fn count_trailing_positionals(tail: &[&str]) -> Option<usize> {
    tail.iter()
        .all(|rest| !rest.is_empty() && !rest.starts_with('-'))
        .then_some(tail.len())
}

fn check_merge_flags(flags: &[(&str, Value)]) -> Option<&'static str> {
    let get = |name: &str| {
        flags
            .iter()
            .find(|(flag, _)| *flag == name)
            .map(|(_, value)| value)
    };
    let flag = |name: &str| get(name) == Some(&Value::Bool(true));
    if flag("--ours") || flag("--theirs") {
        return Some(
            r#"the "--ours" and "--theirs" flags are deprecated. use "--auto-merge-resolve" instead"#,
        );
    }
    if get("--auto-merge-resolve")
        .and_then(Value::as_str)
        .is_some_and(|val| !matches!(val, "ours" | "theirs" | "manual"))
    {
        return Some("--auto-merge-resolve must be one of the following: [ours, theirs, manual]");
    }
    if flag("--abort") && flag("--resolve") {
        return Some(r#"unable to use "abort" and "resolve" flags together"#);
    }
    if flag("--no-snap")
        && get("--message")
            .and_then(Value::as_str)
            .is_some_and(|msg| !msg.is_empty())
    {
        return Some(r#"unable to use "noSnap" and "message" flags together"#);
    }
    None
}

fn apply_validate_flag<'a>(
    flags: &mut Vec<(&'a str, Value)>,
    arg: &'a str,
    next: Option<&str>,
) -> Option<usize> {
    const EXTRA_BOOL: [&str; 4] = ["--ours", "--theirs", "--abort", "--resolve"];
    if let Some((raw_flag, val)) = arg.split_once('=') {
        let flag = alias(raw_flag);
        if EXTRA_BOOL.contains(&flag) {
            let bool_val = match val {
                "true" => true,
                "false" => false,
                _ => return None,
            };
            flags.push((flag, json!(bool_val)));
            return Some(0);
        }
        return apply_merge_inline(flags, flag, val);
    }
    if EXTRA_BOOL.contains(&arg) {
        flags.push((arg, json!(true)));
        return Some(0);
    }
    apply_merge_flag(flags, arg, next)
}

/// `args` starts after the command name.
pub fn parse(args: &[&str]) -> Option<Options> {
    let mut flags: Vec<(&str, Value)> = Vec::new();
    let mut positionals: Vec<&str> = Vec::new();
    let mut index = 0;
    while index < args.len() {
        let arg = alias(args[index]);
        index += 1;
        if arg == "--" {
            consume_trailing_positionals(&args[index..], &mut positionals)?;
            break;
        }
        if matches!(arg, "--no-color" | "--no-color=true" | "--no-color=false") {
            continue;
        }
        if !arg.starts_with('-') {
            positionals.push(arg);
            continue;
        }
        index += apply_merge_flag(&mut flags, arg, args.get(index).copied())?;
    }
    build(&flags, &positionals)
}

fn consume_trailing_positionals<'a>(
    tail: &[&'a str],
    positionals: &mut Vec<&'a str>,
) -> Option<()> {
    for &rest in tail {
        (!rest.is_empty() && !rest.starts_with('-')).then_some(())?;
        positionals.push(rest);
    }
    Some(())
}

fn apply_merge_flag<'a>(
    flags: &mut Vec<(&'a str, Value)>,
    arg: &'a str,
    next: Option<&str>,
) -> Option<usize> {
    if let Some((flag, val)) = arg.split_once('=') {
        return apply_merge_inline(flags, alias(flag), val);
    }
    if flags
        .iter()
        .any(|(name, _)| *name == arg)
    {
        return None;
    }
    if BOOLEAN.contains(&arg) {
        flags.push((arg, json!(true)));
        return Some(0);
    }
    if VALUED.contains(&arg) {
        let value = next.filter(|value| !value.is_empty() && !value.starts_with('-'))?;
        flags.push((arg, json!(value)));
        return Some(1);
    }
    None
}

fn apply_merge_inline<'a>(
    flags: &mut Vec<(&'a str, Value)>,
    flag: &'a str,
    val: &str,
) -> Option<usize> {
    if flags
        .iter()
        .any(|(name, _)| *name == flag)
    {
        return None;
    }
    if BOOLEAN.contains(&flag) {
        let bool_val = match val.trim() {
            "true" => true,
            "false" => false,
            _ => return None,
        };
        flags.push((flag, json!(bool_val)));
        return Some(0);
    }
    let trimmed = val.trim();
    if VALUED.contains(&flag) && !trimmed.is_empty() && !trimmed.starts_with('-') {
        flags.push((flag, json!(trimmed)));
        return Some(0);
    }
    None
}

fn alias(arg: &str) -> &str {
    match arg {
        "-x" => "--skip-dependency-installation",
        "-r" => "--auto-merge-resolve",
        "-m" => "--message",
        _ => arg,
    }
}

fn build(flags: &[(&str, Value)], positionals: &[&str]) -> Option<Options> {
    let get = |name: &str| {
        flags
            .iter()
            .find(|(flag, _)| *flag == name)
            .map(|(_, value)| value)
    };
    let flag = |name: &str| get(name) == Some(&Value::Bool(true));
    let resolve = get("--auto-merge-resolve").and_then(Value::as_str);
    let message = get("--message").and_then(Value::as_str);
    let invalid = (flag("--manual") && resolve.is_some())
        || (flag("--no-snap") && message.is_some())
        || positionals.len() > 1;
    if invalid {
        return None;
    }
    let strategy = if flag("--manual") { Some("manual") } else { resolve };
    if strategy.is_some_and(|strategy| !matches!(strategy, "ours" | "theirs" | "manual")) {
        return None;
    }
    let pattern = positionals.first().copied();
    let grammar = |pattern: &str| {
        !pattern.is_empty()
            && pattern.len() <= 4096
            && !pattern.chars().any(char::is_control)
            && (crate::commands::diff::selection::stateful(pattern)
                || pattern.chars().all(pattern_char))
    };
    if pattern.is_some_and(|pattern| !grammar(pattern)) {
        return None;
    }
    Some(Options {
        pattern: pattern.map(str::to_string),
        strategy: strategy.map(str::to_string),
        no_snap: flag("--no-snap"),
        message: message.map(str::to_string),
        verbose: flag("--verbose"),
        skip_install: flag("--skip-dependency-installation"),
    })
}

/// `[a-z0-9_./-]`.
fn pattern_char(character: char) -> bool {
    character.is_ascii_lowercase()
        || character.is_ascii_digit()
        || "_./-*?!,[]{}@()+".contains(character)
}

impl Options {
    /// The `options` of `commandPrepare`: `JSON.stringify` drops the absent ones.
    pub fn request(&self) -> Value {
        let mut options = json!({});
        if let Some(pattern) = &self.pattern {
            options["pattern"] = json!(pattern);
        }
        options["all"] = json!(false);
        if let Some(strategy) = &self.strategy {
            options["strategy"] = json!(strategy);
        }
        options["forceOurs"] = json!(false);
        options["forceTheirs"] = json!(false);
        options["noSnap"] = json!(self.no_snap);
        if let Some(message) = &self.message {
            options["message"] = json!(message);
        }
        options["verbose"] = json!(self.verbose);
        options["skipDependencyInstallation"] = json!(true);
        options
    }
}

#[cfg(test)]
mod options_tests;
