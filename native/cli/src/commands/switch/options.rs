//! `SwitchCmd` and `LaneImportCmd` retain distinct released flag grammars.
use serde_json::{Value, json};
use std::collections::HashSet;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Options {
    pub lane: String,
    pub skip_fetch: bool,
    pub verbose: bool,
    pub force_ours: bool,
    pub force_theirs: bool,
    pub skip_install: bool,
    pub adoption: Adoption,
}
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Adoption {
    pub alias: Option<String>,
    pub pattern: Option<String>,
    pub strategy: Option<String>,
    pub workspace_only: bool,
    pub json: bool,
    pub head: bool,
    pub get_all: bool,
}

pub fn parse(args: &[&str]) -> Option<Options> {
    parse_mode(args, false)
}
pub(in crate::commands) fn parse_import(args: &[&str]) -> Option<Options> {
    parse_mode(args, true)
}
fn parse_mode(args: &[&str], import: bool) -> Option<Options> {
    let mut options = Options::default();
    let mut seen = HashSet::new();
    let mut values = args.iter().copied();
    while let Some(value) = values.next() {
        if value == "--" {
            consume_trailing_lanes(values, &mut options)?;
            break;
        }
        if value == "--no-color" {
            continue;
        }
        if value.starts_with('-') {
            let key = flag(&mut options, value, &mut values, import)?;
            seen.insert(key).then_some(())?;
        } else {
            lane(&mut options, value)?;
        }
    }
    (!options.lane.is_empty()).then_some(options)
}
fn consume_trailing_lanes<'a>(
    values: impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    for rest in values {
        lane(options, rest)?;
    }
    Some(())
}
fn lane(options: &mut Options, value: &str) -> Option<()> {
    if !options.lane.is_empty() || !valid_lane(value) {
        return None;
    }
    value.clone_into(&mut options.lane);
    Some(())
}
fn flag<'a>(
    options: &mut Options,
    flag: &str,
    values: &mut impl Iterator<Item = &'a str>,
    import: bool,
) -> Option<&'static str> {
    if let Some(key) = inline_flag(options, flag, import) {
        return key;
    }
    let key = match flag {
        "-x" | "--skip-dependency-installation" => set(&mut options.skip_install, true, "install"),
        "--force-ours" => set(&mut options.force_ours, true, "ours"),
        "--force-theirs" => set(&mut options.force_theirs, true, "theirs"),
        "-p" | "--pattern" => take(&mut options.adoption.pattern, values, "pattern")?,
        "-r" | "--auto-merge-resolve" => take(&mut options.adoption.strategy, values, "strategy")?,
        other if !import => switch_flag(options, other, values)?,
        _ => return None,
    };
    Some(key)
}
fn inline_flag(options: &mut Options, flag: &str, import: bool) -> Option<Option<&'static str>> {
    let (name, val) = flag.split_once('=')?;
    Some(match name {
        "--skip-dependency-installation" => {
            set_inline_bool(&mut options.skip_install, val, "install")
        }
        "--force-ours" => set_inline_bool(&mut options.force_ours, val, "ours"),
        "--force-theirs" => set_inline_bool(&mut options.force_theirs, val, "theirs"),
        "--pattern" | "-p" => set_inline_str(&mut options.adoption.pattern, val, "pattern"),
        "--auto-merge-resolve" | "-r" => {
            set_inline_str(&mut options.adoption.strategy, val, "strategy")
        }
        other if !import => switch_inline_flag(options, other, val),
        _ => None,
    })
}
fn switch_inline_flag(options: &mut Options, name: &str, val: &str) -> Option<&'static str> {
    match name {
        "--skip-fetch" => set_inline_bool(&mut options.skip_fetch, val, "fetch"),
        "--verbose" => set_inline_bool(&mut options.verbose, val, "verbose"),
        "--workspace-only" => {
            set_inline_bool(&mut options.adoption.workspace_only, val, "workspace")
        }
        "--json" => set_inline_bool(&mut options.adoption.json, val, "json"),
        "--head" => set_inline_bool(&mut options.adoption.head, val, "head"),
        "--get-all" => set_inline_bool(&mut options.adoption.get_all, val, "all"),
        "--alias" | "-n" => set_inline_str(&mut options.adoption.alias, val, "alias"),
        _ => None,
    }
}
fn set_inline_bool(slot: &mut bool, val: &str, key: &'static str) -> Option<&'static str> {
    let enabled = match val {
        "true" => true,
        "false" => false,
        _ => return None,
    };
    Some(set(slot, enabled, key))
}
fn set_inline_str(slot: &mut Option<String>, val: &str, key: &'static str) -> Option<&'static str> {
    if val.is_empty() || val.starts_with('-') {
        return None;
    }
    *slot = Some(val.to_owned());
    Some(key)
}
fn switch_flag<'a>(
    options: &mut Options,
    flag: &str,
    values: &mut impl Iterator<Item = &'a str>,
) -> Option<&'static str> {
    Some(match flag {
        "--skip-fetch" => set(&mut options.skip_fetch, true, "fetch"),
        "--verbose" => set(&mut options.verbose, true, "verbose"),
        "--workspace-only" => set(&mut options.adoption.workspace_only, true, "workspace"),
        "-j" | "--json" => set(&mut options.adoption.json, true, "json"),
        "-h" | "--head" => set(&mut options.adoption.head, true, "head"),
        "-a" | "--get-all" => set(&mut options.adoption.get_all, true, "all"),
        "-n" | "--alias" => take(&mut options.adoption.alias, values, "alias")?,
        _ => return None,
    })
}
fn set(slot: &mut bool, val: bool, key: &'static str) -> &'static str {
    *slot = val;
    key
}
fn take<'a>(
    slot: &mut Option<String>,
    values: &mut impl Iterator<Item = &'a str>,
    key: &'static str,
) -> Option<&'static str> {
    let value = values.next()?;
    if value.is_empty() || value.starts_with('-') {
        return None;
    }
    *slot = Some(value.to_owned());
    Some(key)
}
fn valid_lane(lane: &str) -> bool {
    !lane.is_empty()
        && lane.len() <= 256
        && !lane.contains("..")
        && lane.split('/').count() <= 2
        && lane
            .split('/')
            .all(|part| !part.is_empty() && part.bytes().all(lane_char))
}
fn lane_char(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'$' | b'!')
}
impl Options {
    pub fn request(&self) -> Value {
        json!({
            "lane": {"name":self.lane,"skipFetch":self.skip_fetch,
                "alias":self.adoption.alias,"pattern":self.adoption.pattern,
                "workspaceOnly":self.adoption.workspace_only},
            "strategy":self.adoption.strategy,
            // Installation follows the native VCS commit.
            "skipDependencyInstallation":true,"verbose":self.verbose,
            "forceOurs":self.force_ours,"forceTheirs":self.force_theirs,
        })
    }
    pub(in crate::commands) fn preflight_error(&self, lane_import: bool) -> Option<&'static str> {
        if lane_import && self.force_ours && self.force_theirs {
            return Some("please use either --force-ours or --force-theirs, not both");
        }
        let invalid_strategy = self.adoption.strategy
            .as_deref()
            .is_some_and(|strategy| !matches!(strategy, "ours" | "theirs" | "manual"))
            && !(lane_import && (self.force_ours || self.force_theirs));
        invalid_strategy.then_some("merge must be one of the following: ours, theirs, manual")
    }
    pub(super) fn warnings(&self) -> Vec<String> {
        [(self.adoption.get_all, "get-all"), (self.adoption.head, "head")]
            .into_iter()
            .filter(|(enabled, _)| *enabled)
            .map(|(_, name)| {
                format!("the --{name} flag is deprecated and currently the default behavior")
            })
            .collect()
    }
    pub(super) fn supported_pattern(&self) -> bool {
        self.adoption.pattern
            .as_ref()
            .is_none_or(|pattern| {
                !pattern.contains(['$', '&'])
                    && !pattern.contains(" AND ")
                    && crate::commands::patterns::split(pattern)
                        .iter()
                        .all(|part| {
                            let glob = part
                                .split('@')
                                .next()
                                .unwrap_or_default();
                            let glob = glob.strip_prefix('!').unwrap_or(glob);
                            !glob.is_empty()
                                && !glob.starts_with('#')
                                && !glob.contains(['{', '}', '(', ')', '+', '!', '\\'])
                        })
            })
    }
}
#[cfg(test)]
mod options_tests;
