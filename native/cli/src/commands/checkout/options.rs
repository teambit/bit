//! The native checkout grammar: the unambiguous subset
//! of `bit checkout <to> [component-pattern]` that native planning accepts.
//! Anything else is `None`, and the Node.js CLI runs the command.

mod numeric_target;
#[cfg(test)]
mod options_tests;

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
    let (flags, positionals) = read_checkout(args, false)?;
    build(&flags, &positionals)
}

/// Deterministic option validation error thrown by `CheckoutCmd.report` before checkout runs.
pub fn validate_error(args: &[&str]) -> Option<&'static str> {
    let (flags, positionals) = read_checkout(args, true)?;
    if positionals.is_empty() || positionals.len() > 2 {
        return None;
    }
    let to = numeric_target::normalize(positionals[0]);
    if flags.get("--force-ours") == Some(&Value::Bool(true))
        && flags.get("--force-theirs") == Some(&Value::Bool(true))
    {
        return Some("please use either --force-ours or --force-theirs, not both");
    }
    if flags
        .get("--auto-merge-resolve")
        .and_then(Value::as_str)
        .is_some_and(|val| !matches!(val, "ours" | "theirs" | "manual"))
    {
        return Some("--auto-merge-resolve must be one of the following: [ours, theirs, manual]");
    }
    validate_target_error(&flags, &to)
}

fn validate_target_error(flags: &Map<String, Value>, to: &str) -> Option<&'static str> {
    if flags.get("--workspace-only") == Some(&Value::Bool(true)) && to != "head" {
        return Some(
            r#"--workspace-only is only relevant when running "bit checkout head" on a lane"#,
        );
    }
    if flags.get("--include-new-from-scope") == Some(&Value::Bool(true)) && to != "head" {
        return Some(
            r#"--include-new-from-scope is only relevant when running "bit checkout head""#,
        );
    }
    to.strip_prefix("head~")
        .filter(|after| numeric_target::head_tilde_is_nan(after))
        .map(|_| r#"the character after "head~" must be a number, got NaN"#)
}

fn read_checkout<'a>(
    args: &[&'a str],
    allow_interactive: bool,
) -> Option<(Map<String, Value>, Vec<&'a str>)> {
    let mut flags: Map<String, Value> = Map::new();
    let mut positionals: Vec<&str> = Vec::new();
    let mut index = 0;
    while index < args.len() {
        let raw = args[index];
        index += 1;
        if raw == "--" {
            extend_non_flag_positionals(&mut positionals, &args[index..])?;
            break;
        }
        if matches!(raw, "--no-color" | "--no-color=true" | "--no-color=false") {
            continue;
        }
        if !raw.starts_with('-') {
            (!raw.is_empty()).then_some(())?;
            positionals.push(raw);
            continue;
        }
        index += apply_checkout_flag(&mut flags, raw, args.get(index).copied(), allow_interactive)?;
    }
    Some((flags, positionals))
}

fn extend_non_flag_positionals<'a>(positionals: &mut Vec<&'a str>, tail: &[&'a str]) -> Option<()> {
    tail.iter()
        .all(|item| !item.is_empty() && !item.starts_with('-'))
        .then(|| positionals.extend_from_slice(tail))
}

fn apply_checkout_flag(
    flags: &mut Map<String, Value>,
    raw: &str,
    next: Option<&str>,
    allow_interactive: bool,
) -> Option<usize> {
    if let Some((flag, val)) = raw.split_once('=') {
        return apply_checkout_inline(flags, alias(flag), val, allow_interactive);
    }
    if raw.starts_with('-') && !raw.starts_with("--") && raw.len() > 2 {
        return apply_short_bundle(flags, &raw[1..], allow_interactive);
    }
    let arg = alias(raw);
    if flags.contains_key(arg) {
        return None;
    }
    if BOOLEAN.contains(&arg) || (allow_interactive && arg == "--interactive-merge") {
        flags.insert(arg.to_string(), json!(true));
        return Some(0);
    }
    if arg == "--auto-merge-resolve" {
        let value = next.filter(|value| !value.is_empty() && !value.starts_with('-'))?;
        flags.insert(arg.to_string(), json!(value));
        return Some(1);
    }
    None
}

fn apply_short_bundle(
    flags: &mut Map<String, Value>,
    bundle: &str,
    allow_interactive: bool,
) -> Option<usize> {
    for ch in bundle.chars() {
        let canonical = match ch {
            'x' => "--skip-dependency-installation",
            'a' => "--all",
            'v' => "--verbose",
            'e' => "--workspace-only",
            'i' if allow_interactive => "--interactive-merge",
            _ => return None,
        };
        if flags.contains_key(canonical) {
            return None;
        }
        flags.insert(canonical.to_string(), json!(true));
    }
    Some(0)
}

fn apply_checkout_inline(
    flags: &mut Map<String, Value>,
    flag: &str,
    val: &str,
    allow_interactive: bool,
) -> Option<usize> {
    if flags.contains_key(flag) {
        return None;
    }
    if BOOLEAN.contains(&flag) || (allow_interactive && flag == "--interactive-merge") {
        let bool_val = match val {
            "true" => true,
            "false" => false,
            _ => return None,
        };
        flags.insert(flag.to_string(), json!(bool_val));
        return Some(0);
    }
    if flag == "--auto-merge-resolve" && !val.is_empty() && !val.starts_with('-') {
        flags.insert(flag.to_string(), json!(val));
        return Some(0);
    }
    None
}

fn alias(arg: &str) -> &str {
    match arg {
        "-x" => "--skip-dependency-installation",
        "-r" => "--auto-merge-resolve",
        "-a" => "--all",
        "-v" => "--verbose",
        "-e" => "--workspace-only",
        "-i" => "--interactive-merge",
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
    if !numeric_target::valid_to(&to) {
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
    if !valid_pattern(pattern) || !(to == "main" || numeric_target::valid_revert_version(&to)) {
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
    let mut index = 0;
    while index < args.len() {
        let arg = args[index];
        index += 1;
        match arg {
            "--" => {
                extend_non_flag_positionals(&mut positionals, &args[index..])?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" => {}
            "-v" | "--verbose" | "--verbose=true" => verbose = true,
            "--verbose=false" => verbose = false,
            "-x" | "--skip-dependency-installation" | "--skip-dependency-installation=true" => {
                skip_install = true;
            }
            "--skip-dependency-installation=false" => skip_install = false,
            "-vx" | "-xv" => {
                verbose = true;
                skip_install = true;
            }
            value if !value.starts_with('-') && !value.is_empty() => positionals.push(value),
            _ => return None,
        }
    }
    Some((positionals, verbose, skip_install))
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
