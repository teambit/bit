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
        if value.starts_with('-') {
            let key = flag(&mut options, value, &mut values, import)?;
            if !seen.insert(key) {
                return None;
            }
        } else {
            lane(&mut options, value)?;
        }
    }
    (!options.lane.is_empty()).then_some(options)
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
    let key = match flag {
        "-x" | "--skip-dependency-installation" => set(&mut options.skip_install, "install"),
        "--force-ours" => set(&mut options.force_ours, "ours"),
        "--force-theirs" => set(&mut options.force_theirs, "theirs"),
        "-p" | "--pattern" => take(&mut options.adoption.pattern, values, "pattern")?,
        "-r" | "--auto-merge-resolve" => take(&mut options.adoption.strategy, values, "strategy")?,
        other if !import => switch_flag(options, other, values)?,
        _ => return None,
    };
    Some(key)
}
fn switch_flag<'a>(
    options: &mut Options,
    flag: &str,
    values: &mut impl Iterator<Item = &'a str>,
) -> Option<&'static str> {
    Some(match flag {
        "--skip-fetch" => set(&mut options.skip_fetch, "fetch"),
        "--verbose" => set(&mut options.verbose, "verbose"),
        "--workspace-only" => set(&mut options.adoption.workspace_only, "workspace"),
        "-j" | "--json" => set(&mut options.adoption.json, "json"),
        "-h" | "--head" => set(&mut options.adoption.head, "head"),
        "-a" | "--get-all" => set(&mut options.adoption.get_all, "all"),
        "-n" | "--alias" => take(&mut options.adoption.alias, values, "alias")?,
        _ => return None,
    })
}
fn set(slot: &mut bool, key: &'static str) -> &'static str {
    *slot = true;
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
