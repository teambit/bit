//! The native tag grammar, with `validateOptions` of `@teambit/snapping`:
//! ordinary and soft tags. Editor, build and publish flags stay
//! with the Node.js CLI.

#[cfg(test)]
mod options_tests;

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
const STRINGS: [&str; 7] = [
    "--message",
    "--ver",
    "--increment",
    "--auto-tag-increment",
    "--prerelease-id",
    "--increment-by",
    "--versions-file",
];

#[derive(Debug, Default, PartialEq)]
pub struct Options {
    pub message: Option<String>,
    pub unmodified: bool,
    pub unmerged: bool,
    pub selection: TagSelection,
    pub release: Release,
    pub snapped: bool,
    pub skip_auto_tag: bool,
    pub mode: Mode,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct TagSelection {
    pub patterns: Vec<String>,
    pub versions_file: Option<String>,
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
#[derive(Debug, Default, PartialEq)]
pub struct Release {
    /// `releaseType`.
    pub level: String,
    pub auto_tag_release_type: Option<String>,
    pub increment_by: f64,
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

/// When `args` only fails `parse` because `--ver` is not a valid semver string,
/// return the parsed options (with a placeholder version) and the invalid `--ver` value.
pub fn invalid_ver(args: &[&str]) -> Option<(Options, String)> {
    let mut flags = read(args)?;
    let ver = flags.string("--ver")?.to_owned();
    if node_semver::npm::valid(&ver).is_some() {
        return None;
    }
    flags.values.insert("--ver".to_string(), json!("0.0.1"));
    let options = validate(&flags)?;
    Some((options, ver))
}

/// When `args` fails `validateOptions` in `TagCmd.report`, return `(warn_message, error)`.
pub fn validate_error(args: &[&str], has_editor: bool) -> Option<(bool, String)> {
    let flags = read(args)?;
    let warn = flags.string("--message").is_none()
        && !flags.flag("--persist")
        && flags.string("--persist").is_none()
        && !has_editor;
    let err = validate_options_error(&flags)?;
    Some((warn, err))
}

fn validate_options_error(flags: &Flags) -> Option<String> {
    let increment = flags.string("--increment").map(str::trim);
    let auto_tag = flags.string("--auto-tag-increment").map(str::trim);
    let pre_release = flags.values.get("--pre-release");
    let prerelease =
        |level: Option<&str>| level.is_some_and(|level| PRE_RELEASE_TYPES.contains(&level));
    if flags.string("--prerelease-id").is_some() && !prerelease(increment) && !prerelease(auto_tag)
    {
        return Some(
            "--prerelease-id should be entered along with --increment or --auto-tag-increment flag, while the increment must be one of the following: [prepatch, prerelease, preminor, premajor]"
                .to_owned(),
        );
    }
    let named_count = ["major", "minor", "patch"]
        .into_iter()
        .filter(|level| flags.flag(&format!("--{level}")))
        .count()
        + usize::from(pre_release.is_some());
    if named_count > 1 {
        return Some(
            "you can use only one of the following - patch, minor, major, pre-release".to_owned(),
        );
    }
    if auto_tag.is_some() && flags.flag("--skip-auto-tag") {
        return Some(
            "you can use either --auto-tag-increment or --skip-auto-tag, but not both".to_owned(),
        );
    }
    invalid_increment_error(increment, auto_tag)
        .or_else(|| {
            flags
                .string("--persist")
                .map(|_| {
                    "unknown value for --persist, use either --persist or --persist=skip-build"
                        .to_owned()
                })
        })
}

fn invalid_increment_error(increment: Option<&str>, auto_tag: Option<&str>) -> Option<String> {
    if let Some(inc) = increment.filter(|inc| !RELEASE_TYPES.contains(inc)) {
        return Some(format!(
            "invalid increment-level \"{inc}\".\nsemver allows the following options only: major, premajor, minor, preminor, patch, prepatch, prerelease",
        ));
    }
    auto_tag
        .filter(|inc| !RELEASE_TYPES.contains(inc))
        .map(|inc| {
            format!(
                "invalid auto-tag-increment level \"{inc}\".\nsemver allows the following options only: major, premajor, minor, preminor, patch, prepatch, prerelease",
            )
        })
}

fn read(args: &[&str]) -> Option<Flags> {
    let mut flags = Flags::default();
    let mut index = 0;
    while index < args.len() {
        let raw = args[index];
        index += 1;
        if raw == "--" {
            return append_trailing_patterns(&mut flags, &args[index..]).then_some(flags);
        }
        if matches!(
            raw,
            "--no-color"
                | "--no-color=true"
                | "--no-color=false"
                | "--color"
                | "--color=true"
                | "--color=false"
                | "--color=always"
                | "--color=never",
        ) {
            continue;
        }
        if !raw.starts_with('-') {
            flags.patterns.push(pattern(raw)?.to_string());
            continue;
        }
        let (key, value, consume_next) = read_flag_entry(raw, args.get(index).copied())?;
        if flags.values.contains_key(key) {
            return None;
        }
        index += usize::from(consume_next);
        flags.values.insert(key.to_string(), value);
    }
    Some(flags)
}

fn append_trailing_patterns(flags: &mut Flags, rest: &[&str]) -> bool {
    for item in rest {
        if item.starts_with('-') {
            return false;
        }
        let Some(pat) = pattern(item) else {
            return false;
        };
        flags.patterns.push(pat.to_string());
    }
    true
}

fn read_flag_entry<'a>(raw: &'a str, next: Option<&str>) -> Option<(&'a str, Value, bool)> {
    if let Some((raw_key, inline)) = raw.split_once('=') {
        let key = alias(raw_key);
        return Some((key, inline_option_value(raw_key, key, inline)?, false));
    }
    let key = alias(raw);
    let next = next.filter(|value| !value.starts_with('-'));
    let (value, consume) = option_value(key, next)?;
    Some((key, value, consume))
}

fn inline_option_value(raw_key: &str, key: &str, inline: &str) -> Option<Value> {
    if let Some(val) = inline_bool_value(raw_key, key, inline) {
        return Some(val);
    }
    if (STRINGS.contains(&key) || key == "--persist")
        && !inline.is_empty()
        && !inline.starts_with('-')
    {
        return Some(json!(inline));
    }
    if key == "--pre-release" && !inline.starts_with('-') {
        return Some(if inline.is_empty() { json!(true) } else { json!(inline) });
    }
    None
}

fn inline_bool_value(raw_key: &str, key: &str, inline: &str) -> Option<Value> {
    if key == "--persist" {
        return match inline {
            "skip-build" | "true" => Some(json!(true)),
            "false" => Some(json!(false)),
            _ => None,
        };
    }
    if BOOLEANS.contains(&key) && raw_key.starts_with("--") {
        return match inline {
            "true" => Some(json!(true)),
            "false" => Some(json!(false)),
            _ => None,
        };
    }
    None
}

fn option_value(argument: &str, next: Option<&str>) -> Option<(Value, bool)> {
    if BOOLEANS.contains(&argument) {
        return Some((json!(true), false));
    }
    if argument == "--persist" {
        return Some((json!(true), next == Some("skip-build")));
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

/// A bounded workspace pattern, including state predicates.
fn pattern(text: &str) -> Option<&str> {
    let valid = !text.is_empty() && text.len() <= 4096 && !text.contains('\0');
    valid.then_some(text)
}

/// `validateOptions`, and the increment and exact version checks.
fn validate(flags: &Flags) -> Option<Options> {
    if (flags.flag("--soft") && flags.flag("--persist")) || flags.string("--persist").is_some() {
        return None;
    }
    Some(Options {
        message: flags.string("--message").map(str::to_string),
        unmodified: flags.flag("--unmodified"),
        unmerged: flags.flag("--unmerged"),
        selection: TagSelection {
            patterns: flags.patterns.clone(),
            versions_file: flags.string("--versions-file").map(str::to_owned),
        },
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

/// The release levels, `--increment-by` (a finite count from 0 to 4096) and
/// `--ver` (a semver version).
fn release(flags: &Flags) -> Option<Release> {
    let increment_by = flags
        .string("--increment-by")
        .map_or(Some(1.0), |text| {
            text.trim()
                .parse::<f64>()
                .ok()
                .filter(|count| count.is_finite() && (0.0..=4096.0).contains(count))
        })?;
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
    if validate_options_error(flags).is_some() {
        return None;
    }
    let increment = flags.string("--increment");
    let auto_tag = flags.string("--auto-tag-increment");
    let pre_release = flags.values.get("--pre-release");
    let named = ["major", "minor", "patch"]
        .into_iter()
        .find(|level| flags.flag(&format!("--{level}")));
    let release_type = increment
        .or(named)
        .or_else(|| pre_release.map(|_| "prerelease"))
        .unwrap_or("patch");
    let pre_release_id = flags
        .string("--prerelease-id")
        .or_else(|| pre_release.and_then(Value::as_str))
        .map(str::trim)
        .filter(|id| !id.is_empty());
    Some((
        release_type.to_string(),
        auto_tag.map(str::to_string),
        pre_release_id.map(str::to_string),
    ))
}
