//! `parseRustWorkspaceTag` with `validateOptions` of `@teambit/snapping`:
//! ordinary persisted tags only. Editor, build, soft and publish flags stay
//! with the Node.js CLI.

use serde_json::{Map, Value, json};

const RELEASE_TYPES: [&str; 7] =
    ["major", "premajor", "minor", "preminor", "patch", "prepatch", "prerelease"];
const PRE_RELEASE_TYPES: [&str; 4] = ["prepatch", "prerelease", "preminor", "premajor"];
const BOOLEANS: [&str; 7] =
    ["--unmodified", "--unmerged", "--snapped", "--skip-auto-tag", "--patch", "--minor", "--major"];
const STRINGS: [&str; 6] = [
    "--message",
    "--ver",
    "--increment",
    "--auto-tag-increment",
    "--prerelease-id",
    "--increment-by",
];

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Options {
    pub message: Option<String>,
    pub unmodified: bool,
    pub unmerged: bool,
    pub patterns: Vec<String>,
    pub release: Release,
    pub snapped: bool,
    pub skip_auto_tag: bool,
}

/// How the versions are bumped: `validateOptions`' release types,
/// `--increment-by` and `--ver`.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Release {
    /// `releaseType`.
    pub level: String,
    pub auto_tag_release_type: Option<String>,
    pub increment_by: u64,
    pub exact_version: Option<String>,
    pub pre_release_id: Option<String>,
}

/// The flags as entered: booleans, strings, and `--pre-release` with an
/// optional value.
#[derive(Default)]
struct Flags {
    values: Map<String, Value>,
    patterns: Vec<String>,
}

/// `args` starts after the command name.
pub fn parse(args: &[&str]) -> Option<Options> {
    let flags = read(args)?;
    validate(&flags)
}

fn read(args: &[&str]) -> Option<Flags> {
    let mut flags = Flags::default();
    let mut index = 0;
    while index < args.len() {
        let argument = alias(args[index]);
        index += 1;
        if !argument.starts_with('-') {
            flags.patterns.push(pattern(argument)?.to_string());
            continue;
        }
        if flags.values.contains_key(argument) {
            return None;
        }
        let next = args
            .get(index)
            .copied()
            .filter(|value| !value.starts_with('-'));
        let value = if BOOLEANS.contains(&argument) {
            json!(true)
        } else if STRINGS.contains(&argument) {
            index += 1;
            json!(next?)
        } else if argument == "--pre-release" {
            index += usize::from(next.is_some());
            next.map_or(json!(true), |value| json!(value))
        } else {
            return None;
        };
        flags.values.insert(argument.to_string(), value);
    }
    Some(flags)
}

fn alias(argument: &str) -> &str {
    match argument {
        "-m" => "--message",
        "-u" => "--unmodified",
        "-v" => "--ver",
        "-l" => "--increment",
        "-p" => "--patch",
        other => other,
    }
}

/// A pattern without state selectors (`$…`) or `AND`.
fn pattern(text: &str) -> Option<&str> {
    let valid = !text.is_empty()
        && text.len() <= 4096
        && !text.contains('\0')
        && !text
            .split(',')
            .any(|part| part.trim().starts_with('$') || part.contains(" AND "));
    valid.then_some(text)
}

/// `validateOptions`, and the increment and exact version checks.
fn validate(flags: &Flags) -> Option<Options> {
    Some(Options {
        message: flags.string("--message").map(str::to_string),
        unmodified: flags.flag("--unmodified"),
        unmerged: flags.flag("--unmerged"),
        patterns: flags.patterns.clone(),
        release: release(flags)?,
        snapped: flags.flag("--snapped"),
        skip_auto_tag: flags.flag("--skip-auto-tag"),
    })
}

impl Flags {
    fn string(&self, name: &str) -> Option<&str> {
        self.values.get(name).and_then(Value::as_str)
    }

    fn flag(&self, name: &str) -> bool {
        self.values.get(name) == Some(&Value::Bool(true))
    }
}

/// The release levels, `--increment-by` (a decimal from 1 to 4096) and
/// `--ver` (a semver version).
fn release(flags: &Flags) -> Option<Release> {
    let increment_by = match flags.string("--increment-by") {
        None => 1,
        Some(text) if text.bytes().all(|byte| byte.is_ascii_digit()) => text
            .parse::<u64>()
            .ok()
            .filter(|count| (1..=4096).contains(count))?,
        Some(_) => return None,
    };
    let exact_version = match flags.string("--ver") {
        None => None,
        Some(version) => Some(node_semver::npm::valid(version)?),
    };
    let (level, auto_tag_release_type, pre_release_id) = levels(flags)?;
    Some(Release { level, auto_tag_release_type, increment_by, exact_version, pre_release_id })
}

/// `validateOptions`: the release type, the auto-tag release type and the
/// pre-release id.
fn levels(flags: &Flags) -> Option<(String, Option<String>, Option<String>)> {
    let increment = flags.string("--increment");
    let auto_tag = flags.string("--auto-tag-increment");
    let pre_release = flags.values.get("--pre-release");
    let prerelease =
        |level: Option<&str>| level.is_some_and(|level| PRE_RELEASE_TYPES.contains(&level));
    if flags.string("--prerelease-id").is_some() && !prerelease(increment) && !prerelease(auto_tag)
    {
        return None;
    }
    let named = ["major", "minor", "patch"]
        .into_iter()
        .filter(|level| flags.flag(&format!("--{level}")));
    let named: Vec<&str> = named.collect();
    let conflicting = named.len() + usize::from(pre_release.is_some()) > 1;
    let unknown = [increment, auto_tag]
        .iter()
        .flatten()
        .any(|level| !RELEASE_TYPES.contains(level));
    let both_auto_tag_flags = auto_tag.is_some() && flags.flag("--skip-auto-tag");
    if conflicting || unknown || both_auto_tag_flags {
        return None;
    }
    let release_type = increment
        .or_else(|| named.first().copied())
        .or_else(|| pre_release.map(|_| "prerelease"))
        .unwrap_or("patch");
    let pre_release_id = flags
        .string("--prerelease-id")
        .or_else(|| pre_release.and_then(Value::as_str));
    Some((
        release_type.to_string(),
        auto_tag.map(str::to_string),
        pre_release_id.map(str::to_string),
    ))
}

impl Options {
    /// `options` of `commandTagPrepare`, as `JSON.stringify` writes them.
    pub fn request(&self) -> Value {
        let mut options = json!({});
        if let Some(message) = &self.message {
            options["message"] = json!(message);
        }
        options["unmodified"] = json!(self.unmodified);
        options["unmerged"] = json!(self.unmerged);
        options["build"] = json!(false);
        options
    }

    /// `tagOptions` of `commandTagPrepare`.
    pub fn tag_options(&self) -> Value {
        let release = &self.release;
        let mut options = json!({ "patterns": self.patterns, "releaseType": release.level });
        if let Some(level) = &release.auto_tag_release_type {
            options["autoTagReleaseType"] = json!(level);
        }
        options["incrementBy"] = json!(release.increment_by);
        if let Some(version) = &release.exact_version {
            options["exactVersion"] = json!(version);
        }
        if let Some(id) = &release.pre_release_id {
            options["preReleaseId"] = json!(id);
        }
        options["snapped"] = json!(self.snapped);
        options["skipAutoTag"] = json!(self.skip_auto_tag);
        options
    }
}

#[cfg(test)]
mod options_tests;
