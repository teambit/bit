//! The lane merge grammar native planning accepts.

use serde_json::{Map, Value, json};

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Options {
    pub name: String,
    pub pattern: Option<String>,
    pub strategy: Option<String>,
    pub resolve_unrelated: Option<String>,
    pub message: Option<String>,
    pub verbose: bool,
    pub skip_install: bool,
    /// The boolean flags, as given.
    flags: Vec<String>,
}

const BOOLEANS: [&str; 11] = [
    "--skip-dependency-installation",
    "--manual",
    "--verbose",
    "--no-auto-snap",
    "--no-snap",
    "--no-squash",
    "--squash",
    "--skip-fetch",
    "--include-deps",
    "--workspace",
    "--exclude-non-lane-comps",
];
const VALUED: [&str; 3] = ["--auto-merge-resolve", "--message", "--pattern"];

/// `args` starts after `lane merge`.
pub fn parse(args: &[&str]) -> Option<Options> {
    let read = read(args)?;
    let [name, rest @ ..] = read.positionals.as_slice() else { return None };
    let pattern = read.pattern(rest)?;
    if !lane_name(name) || read.conflicting(pattern) {
        return None;
    }
    let strategy =
        if read.has("--manual") { Some("manual") } else { read.value("--auto-merge-resolve") };
    if strategy.is_some_and(|strategy| !matches!(strategy, "ours" | "theirs" | "manual")) {
        return None;
    }
    if read
        .value("--resolve-unrelated")
        .is_some_and(|value| !matches!(value, "ours" | "theirs"))
    {
        return None;
    }
    Some(Options {
        name: name.clone(),
        pattern: pattern.map(str::to_string),
        strategy: strategy.map(str::to_string),
        resolve_unrelated: read.value("--resolve-unrelated").map(str::to_string),
        message: read.value("--message").map(str::to_string),
        verbose: read.has("--verbose"),
        skip_install: read.has("--skip-dependency-installation"),
        flags: read.flags.clone(),
    })
}

/// The arguments as entered.
#[derive(Default)]
struct Read {
    flags: Vec<String>,
    values: Map<String, Value>,
    positionals: Vec<String>,
}

impl Read {
    fn has(&self, flag: &str) -> bool {
        self.flags
            .iter()
            .any(|known| known == flag)
    }

    fn value(&self, flag: &str) -> Option<&str> {
        self.values.get(flag).and_then(Value::as_str)
    }

    /// The positional pattern or `--pattern`, not both.
    fn pattern<'r>(&'r self, rest: &'r [String]) -> Option<Option<&'r str>> {
        if rest.len() > 1 || (!rest.is_empty() && self.value("--pattern").is_some()) {
            return None;
        }
        let pattern = rest
            .first()
            .map(String::as_str)
            .or_else(|| self.value("--pattern"));
        if pattern.is_some_and(|pattern| !pattern_text(pattern)) {
            return None;
        }
        Some(pattern)
    }

    /// The flag combinations the native grammar rejects.
    fn conflicting(&self, pattern: Option<&str>) -> bool {
        (self.has("--manual") && self.value("--auto-merge-resolve").is_some())
            || (self.has("--no-squash") && self.has("--squash"))
            || (self.has("--no-auto-snap") && self.value("--message").is_some())
            || (self.has("--include-deps") && pattern.is_none() && !self.has("--workspace"))
    }

    /// One flag; the number of values it consumed.
    fn flag(&mut self, flag: &str, next: Option<&str>) -> Option<usize> {
        if BOOLEANS.contains(&flag) {
            if !self.has(flag) {
                self.flags.push(flag.to_string());
            }
            return Some(0);
        }
        if self.has(flag) || self.values.contains_key(flag) {
            return None;
        }
        if flag == "--resolve-unrelated" {
            let value = next.filter(|value| !value.starts_with('-'));
            self.values.insert(flag.to_owned(), json!(value.unwrap_or("ours")));
            return Some(usize::from(value.is_some()));
        }
        if !VALUED.contains(&flag) {
            return None;
        }
        let value = next.filter(|value| !value.is_empty() && !value.starts_with('-'))?;
        self.values.insert(flag.to_string(), json!(value));
        Some(1)
    }

    fn inline_flag(&mut self, raw_flag: &str, value: &str) -> Option<()> {
        let flag = lane_alias(raw_flag);
        if BOOLEANS.contains(&flag) {
            match value {
                "true" if !self.has(flag) => self.flags.push(flag.to_string()),
                "true" => {}
                "false" => self.flags.retain(|known| known != flag),
                _ => return None,
            }
            return Some(());
        }
        if self.has(flag) || self.values.contains_key(flag) {
            return None;
        }
        if flag == "--resolve-unrelated" || VALUED.contains(&flag) {
            self.flag(flag, Some(value))?;
            return Some(());
        }
        None
    }
}

fn lane_alias(arg: &str) -> &str {
    match arg {
        "-x" => "--skip-dependency-installation",
        "-r" => "--auto-merge-resolve",
        "-m" => "--message",
        other => other,
    }
}

/// The boolean flags, the valued flags and the positionals.
fn read(args: &[&str]) -> Option<Read> {
    let mut read = Read::default();
    let mut index = 0;
    while index < args.len() {
        let arg = lane_alias(args[index]);
        index += 1;
        if arg == "--no-color" {
            continue;
        }
        if let Some((flag, value)) = arg.split_once('=') {
            read.inline_flag(flag, value)?;
            continue;
        }
        if arg.starts_with('-') {
            index += read.flag(arg, args.get(index).copied())?;
        } else {
            read.positionals.push(arg.to_string());
        }
    }
    Some(read)
}

/// `/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?$/`.
fn lane_name(name: &str) -> bool {
    let part = |part: &str| {
        !part.is_empty()
            && part
                .chars()
                .all(|character| {
                    character.is_ascii_lowercase()
                        || character.is_ascii_digit()
                        || "_.-".contains(character)
                })
    };
    match name.split_once('/') {
        Some((scope, lane)) => part(scope) && part(lane),
        None => part(name),
    }
}

/// A pattern without state selectors (`$…`) or `AND`.
fn pattern_text(pattern: &str) -> bool {
    pattern.len() <= 4096
        && !pattern
            .split(',')
            .any(|part| part.trim().starts_with('$') || part.contains(" AND "))
}

impl Options {
    fn has(&self, flag: &str) -> bool {
        self.flags
            .iter()
            .any(|known| known == flag)
    }

    /// The engine's command options without `operation`, as `JSON.stringify`
    /// writes them.
    pub fn request(&self) -> Value {
        let lane = json!({
            "name": self.name,
            "noAutoSnap": self.has("--no-auto-snap"),
            "noSquash": self.has("--no-squash"),
            "squash": self.has("--squash"),
            "skipFetch": self.has("--skip-fetch"),
            "includeDeps": self.has("--include-deps"),
            "workspaceOnly": self.has("--workspace"),
            "excludeNonLaneComps": self.has("--exclude-non-lane-comps"),
        });
        let mut options = json!({ "lane": lane });
        if let Some(pattern) = &self.pattern {
            options["pattern"] = json!(pattern);
        }
        if let Some(strategy) = &self.strategy {
            options["strategy"] = json!(strategy);
        }
        if let Some(strategy) = &self.resolve_unrelated {
            options["lane"]["resolveUnrelated"] = json!(strategy);
        }
        options["noSnap"] = json!(self.has("--no-snap"));
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
