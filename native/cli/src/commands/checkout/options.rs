//! The native checkout grammar: the unambiguous subset
//! of `bit checkout <to> [component-pattern]` that native planning accepts.
//! Anything else is `None`, and the Node.js CLI runs the command.

mod numeric_target;

use serde_json::{Map, Value, json};

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Options {
    pub to: String,
    pub pattern: Option<String>,
    pub revert: bool,
    pub all: bool,
    /// `--auto-merge-resolve <ours|theirs|manual>`, or `--manual`.
    pub strategy: Option<String>,
    force: Force,
    pub workspace_only: bool,
    pub execution: Execution,
}

/// Rendering and installation after the checkout plan is committed.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Execution {
    pub verbose: bool,
    pub skip_install: bool,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct Force {
    ours: bool,
    theirs: bool,
    include_new_from_scope: bool,
}

const BOOLEAN: [&str; 8] = [
    "--skip-dependency-installation",
    "--manual",
    "--verbose",
    "--all",
    "--force-ours",
    "--force-theirs",
    "--workspace-only",
    "--include-new-from-scope",
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
        "-e" => "--workspace-only",
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
    let to = numeric_target::normalize(positionals.first()?);
    if !valid_to(&to) {
        return None;
    }
    if (flag("--workspace-only") || flag("--include-new-from-scope")) && to != "head" {
        return None;
    }
    let pattern = positionals.get(1).copied();
    if flag("--all") && pattern.is_some() || pattern.is_some_and(|pattern| !valid_pattern(pattern))
    {
        return None;
    }
    Some(Options {
        to,
        pattern: pattern.map(str::to_string),
        revert: false,
        all: flag("--all"),
        strategy: strategy.map(str::to_string),
        force: Force {
            ours: flag("--force-ours"),
            theirs: flag("--force-theirs"),
            include_new_from_scope: flag("--include-new-from-scope"),
        },
        workspace_only: flag("--workspace-only"),
        execution: Execution {
            verbose: flag("--verbose"),
            skip_install: flag("--skip-dependency-installation"),
        },
    })
}

/// `bit revert <component-pattern> <main|version>` has the reverse positional
/// order of checkout and only the two options accepted by the Node command.
pub fn parse_revert(args: &[&str]) -> Option<Options> {
    let (positionals, verbose, skip_install) = revert_arguments(args)?;
    let [pattern, to] = positionals.as_slice() else { return None };
    let to = numeric_target::normalize(to);
    if !valid_pattern(pattern) || !(to == "main" || valid_revert_version(&to)) {
        return None;
    }
    Some(Options {
        to,
        pattern: Some((*pattern).to_owned()),
        revert: true,
        execution: Execution { verbose, skip_install },
        ..Options::default()
    })
}

fn revert_arguments<'a>(args: &[&'a str]) -> Option<(Vec<&'a str>, bool, bool)> {
    let mut positionals = Vec::new();
    let mut verbose = false;
    let mut skip_install = false;
    for arg in args {
        match *arg {
            "-v" | "--verbose" if !verbose => verbose = true,
            "-x" | "--skip-dependency-installation" if !skip_install => skip_install = true,
            value if !value.starts_with('-') => positionals.push(value),
            _ => return None,
        }
    }
    Some((positionals, verbose, skip_install))
}

fn valid_revert_version(to: &str) -> bool {
    if matches!(to, "head" | "latest" | "reset") || to.starts_with("head~") {
        return false;
    }
    valid_to(to)
}

/// The merge strategy: `None` when invalid, `Some(None)` when not given.
fn strategy(flags: &Map<String, Value>) -> Option<Option<&str>> {
    let manual = flags.get("--manual") == Some(&Value::Bool(true));
    let resolve = flags.get("--auto-merge-resolve").and_then(Value::as_str);
    if resolve.is_some_and(|strategy| !matches!(strategy, "ours" | "theirs" | "manual")) {
        return None;
    }
    let strategy = if manual { Some("manual") } else { resolve };
    if strategy.is_some_and(|strategy| !matches!(strategy, "ours" | "theirs" | "manual")) {
        return None;
    }
    Some(strategy)
}

/// Component pattern syntax is evaluated against the authoritative workspace pool.
fn valid_pattern(pattern: &str) -> bool {
    !pattern.is_empty() && pattern.len() <= 4096 && !pattern.chars().any(char::is_control)
}

/// `head`, `latest`, `reset`, `main`, `head~N`, a snap hash or a semver tag.
fn valid_to(to: &str) -> bool {
    if matches!(to, "head" | "latest" | "reset" | "main") {
        return true;
    }
    if let Some(steps) = to.strip_prefix("head~") {
        return !steps.is_empty() && steps.bytes().all(|byte| byte.is_ascii_digit());
    }
    if (3..=40).contains(&to.len()) && to.bytes().all(|byte| byte.is_ascii_hexdigit()) {
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
        options["forceOurs"] = json!(self.force.ours);
        options["forceTheirs"] = json!(self.force.theirs);
        options["noSnap"] = json!(false);
        options["revert"] = json!(self.revert);
        options["verbose"] = json!(self.execution.verbose);
        options["workspaceOnly"] = json!(self.workspace_only);
        options["includeNewFromScope"] = json!(self.force.include_new_from_scope);
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
