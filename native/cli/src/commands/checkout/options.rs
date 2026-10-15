//! The native checkout grammar: the unambiguous subset
//! of `bit checkout <to> [component-pattern]` that native planning accepts.
//! Anything else is `None`, and the Node.js CLI runs the command.

use serde_json::{Map, Value, json};

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Options {
    pub to: String,
    pub pattern: Option<String>,
    pub all: bool,
    /// `--auto-merge-resolve <ours|theirs|manual>`, or `--manual`.
    pub strategy: Option<String>,
    pub force_ours: bool,
    pub force_theirs: bool,
    pub verbose: bool,
    pub skip_install: bool,
}

const BOOLEAN: [&str; 6] = [
    "--skip-dependency-installation",
    "--manual",
    "--verbose",
    "--all",
    "--force-ours",
    "--force-theirs",
];

/// `args` starts after the command name.
pub fn parse(args: &[&str]) -> Option<Options> {
    let mut flags: Map<String, Value> = Map::new();
    let mut positionals: Vec<&str> = Vec::new();
    let mut index = 0;
    while index < args.len() {
        let arg = alias(args[index]);
        index += 1;
        if !arg.starts_with('-') {
            positionals.push(arg);
            continue;
        }
        if flags.contains_key(arg) {
            return None;
        }
        if BOOLEAN.contains(&arg) {
            flags.insert(arg.to_string(), json!(true));
        } else if arg == "--auto-merge-resolve" {
            let value = args
                .get(index)
                .filter(|value| !value.is_empty() && !value.starts_with('-'))?;
            index += 1;
            flags.insert(arg.to_string(), json!(value));
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
        "-a" => "--all",
        "-v" => "--verbose",
        _ => arg,
    }
}

fn build(flags: &Map<String, Value>, positionals: &[&str]) -> Option<Options> {
    let flag = |name: &str| flags.get(name) == Some(&Value::Bool(true));
    let strategy = strategy(flags)?;
    let conflicting = flag("--force-ours") && flag("--force-theirs");
    if conflicting || positionals.len() > 2 {
        return None;
    }
    let to = positionals.first().filter(|to| valid_to(to))?;
    let pattern = positionals.get(1).copied();
    if flag("--all") && pattern.is_some()
        || pattern.is_some_and(|pattern| !pattern.chars().all(pattern_char))
    {
        return None;
    }
    Some(Options {
        to: (*to).to_string(),
        pattern: pattern.map(str::to_string),
        all: flag("--all"),
        strategy: strategy.map(str::to_string),
        force_ours: flag("--force-ours"),
        force_theirs: flag("--force-theirs"),
        verbose: flag("--verbose"),
        skip_install: flag("--skip-dependency-installation"),
    })
}

/// The merge strategy: `None` when invalid, `Some(None)` when not given.
fn strategy(flags: &Map<String, Value>) -> Option<Option<&str>> {
    let manual = flags.get("--manual") == Some(&Value::Bool(true));
    let resolve = flags.get("--auto-merge-resolve").and_then(Value::as_str);
    if manual && resolve.is_some() {
        return None;
    }
    let strategy = if manual { Some("manual") } else { resolve };
    if strategy.is_some_and(|strategy| !matches!(strategy, "ours" | "theirs" | "manual")) {
        return None;
    }
    Some(strategy)
}

/// `[a-z0-9_./-]`.
fn pattern_char(character: char) -> bool {
    character.is_ascii_lowercase() || character.is_ascii_digit() || "_./-".contains(character)
}

/// `head`, `latest`, `reset`, `main`, `head~N`, a snap hash or a semver tag.
fn valid_to(to: &str) -> bool {
    if matches!(to, "head" | "latest" | "reset" | "main") {
        return true;
    }
    if let Some(steps) = to.strip_prefix("head~") {
        return !steps.is_empty() && steps.bytes().all(|byte| byte.is_ascii_digit());
    }
    if to.len() == 40
        && to
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return true;
    }
    valid_tag(to)
}

/// `[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?`.
fn valid_tag(to: &str) -> bool {
    let identifier = |text: &str| {
        !text.is_empty()
            && text
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || ".-".contains(character))
    };
    let (main, build) = match to.split_once('+') {
        Some((main, build)) => (main, Some(build)),
        None => (to, None),
    };
    if build.is_some_and(|build| !identifier(build)) {
        return false;
    }
    let (core, prerelease) = match main.split_once('-') {
        Some((core, prerelease)) => (core, Some(prerelease)),
        None => (main, None),
    };
    if prerelease.is_some_and(|prerelease| !identifier(prerelease)) {
        return false;
    }
    let parts: Vec<&str> = core.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
}

impl Options {
    /// The `options` of `commandPrepare`: `JSON.stringify` drops the absent ones.
    pub fn request(&self) -> Value {
        let mut options = json!({ "to": self.to });
        if let Some(pattern) = &self.pattern {
            options["pattern"] = json!(pattern);
        }
        options["all"] = json!(self.all);
        if let Some(strategy) = &self.strategy {
            options["strategy"] = json!(strategy);
        }
        options["forceOurs"] = json!(self.force_ours);
        options["forceTheirs"] = json!(self.force_theirs);
        options["noSnap"] = json!(false);
        options["verbose"] = json!(self.verbose);
        // The native CLI installs after committing the VCS plan.
        options["skipDependencyInstallation"] = json!(true);
        options
    }

    /// `checkoutProps.all` once `parseValues` ran: `head` and `latest`
    /// without a pattern check out every component.
    pub fn report_all(&self) -> bool {
        self.all || (self.pattern.is_none() && matches!(self.to.as_str(), "head" | "latest"))
    }
}

#[cfg(test)]
mod options_tests;
