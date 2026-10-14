//! The merge half of `parseRustWorkspaceCommand`: the unambiguous subset of
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
}

const BOOLEAN: [&str; 4] = ["--skip-dependency-installation", "--manual", "--verbose", "--no-snap"];
const VALUED: [&str; 2] = ["--auto-merge-resolve", "--message"];

/// `args` starts after the command name.
pub fn parse(args: &[&str]) -> Option<Options> {
    let mut flags: Vec<(&str, Value)> = Vec::new();
    let mut positionals: Vec<&str> = Vec::new();
    let mut index = 0;
    while index < args.len() {
        let arg = alias(args[index]);
        index += 1;
        if !arg.starts_with('-') {
            positionals.push(arg);
            continue;
        }
        if flags
            .iter()
            .any(|(name, _)| *name == arg)
        {
            return None;
        }
        if BOOLEAN.contains(&arg) {
            flags.push((arg, json!(true)));
        } else if VALUED.contains(&arg) {
            let value = args
                .get(index)
                .filter(|value| !value.is_empty() && !value.starts_with('-'))?;
            index += 1;
            flags.push((arg, json!(value)));
        } else {
            return None;
        }
    }
    build(&flags, &positionals)
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
    let invalid = !flag("--skip-dependency-installation")
        || (flag("--manual") && resolve.is_some())
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
    let grammar = |pattern: &str| pattern == "**" || pattern.chars().all(pattern_char);
    if pattern.is_some_and(|pattern| !grammar(pattern)) {
        return None;
    }
    Some(Options {
        pattern: pattern.map(str::to_string),
        strategy: strategy.map(str::to_string),
        no_snap: flag("--no-snap"),
        message: message.map(str::to_string),
        verbose: flag("--verbose"),
    })
}

/// `[a-z0-9_./-]`.
fn pattern_char(character: char) -> bool {
    character.is_ascii_lowercase() || character.is_ascii_digit() || "_./-".contains(character)
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
