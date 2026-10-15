//! The native tag grammar, with `validateOptions` of `@teambit/snapping`:
//! ordinary and soft tags. Editor, build and publish flags stay
//! with the Node.js CLI.

use serde_json::{Map, Value, json};

const RELEASE_TYPES: [&str; 7] =
    ["major", "premajor", "minor", "preminor", "patch", "prepatch", "prerelease"];
const PRE_RELEASE_TYPES: [&str; 4] = ["prepatch", "prerelease", "preminor", "premajor"];
const BOOLEANS: [&str; 8] = [
    "--unmodified",
    "--unmerged",
    "--snapped",
    "--skip-auto-tag",
    "--patch",
    "--minor",
    "--major",
    "--soft",
];
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
    pub mode: Mode,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub enum Mode {
    #[default]
    Ordinary,
    Soft,
    Persist,
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
        let key = if argument == "--persist=skip-build" { "--persist" } else { argument };
        if flags.values.contains_key(key) {
            return None;
        }
        let next = args
            .get(index)
            .copied()
            .filter(|value| !value.starts_with('-'));
        let (value, consume_next) = option_value(argument, next)?;
        index += usize::from(consume_next);
        flags.values.insert(key.to_string(), value);
    }
    Some(flags)
}

fn option_value(argument: &str, next: Option<&str>) -> Option<(Value, bool)> {
    if BOOLEANS.contains(&argument) || argument == "--persist=skip-build" {
        return Some((json!(true), false));
    }
    if STRINGS.contains(&argument) {
        return Some((json!(next?), true));
    }
    if argument == "--pre-release" {
        return Some((next.map_or(json!(true), |value| json!(value)), next.is_some()));
    }
    None
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
    if flags.flag("--soft") && flags.flag("--persist") {
        return None;
    }
    Some(Options {
        message: flags.string("--message").map(str::to_string),
        unmodified: flags.flag("--unmodified"),
        unmerged: flags.flag("--unmerged"),
        patterns: flags.patterns.clone(),
        release: release(flags)?,
        snapped: flags.flag("--snapped"),
        skip_auto_tag: flags.flag("--skip-auto-tag"),
        mode: if flags.flag("--soft") {
            Mode::Soft
        } else if flags.flag("--persist") {
            Mode::Persist
        } else {
            Mode::Ordinary
        },
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
        if self.mode == Mode::Soft {
            options["soft"] = json!(true);
        }
        if self.mode == Mode::Persist {
            options["persist"] = json!(true);
        }
        options
    }
}

#[cfg(test)]
mod options_tests;
