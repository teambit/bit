//! Import adoption and noninteractive reverse-graph selection flags.
//!
//! Defines [`AdoptionOptions`], [`DependentsOptions`], and [`Values`] serialized into engine request payloads.
use serde_json::{Value, json};

/// Flags controlling component directory adoption (`--track-only`, `--write-to-empty-dir`, `--write-deps`).
#[derive(Debug, Default, PartialEq, Eq)]
pub struct AdoptionOptions {
    pub track_only: bool,
    pub write_to_empty_dir: bool,
    pub write_deps: Option<String>,
}
/// Flags controlling dependent component selection (`--dependents`, `--dependents-via`, `--dependents-all`, `--silent`).
#[derive(Debug, Default, PartialEq, Eq)]
pub struct DependentsOptions {
    pub enabled: bool,
    pub via: Option<String>,
    pub all: bool,
    pub silent: bool,
}
/// Remaining positional/flag arguments after extracting `--write-deps` and `--dependents-via` values.
pub(super) struct Values<'a> {
    pub args: Vec<&'a str>,
    pub write_deps: Option<String>,
    pub dependents_via: Option<String>,
}
/// Splits out `--write-deps` and `--dependents-via` flag values from `args` before standard flag parsing.
pub(super) fn values<'a>(args: &[&'a str]) -> Option<Values<'a>> {
    let mut values =
        Values { args: Vec::with_capacity(args.len()), write_deps: None, dependents_via: None };
    let mut arguments = args.iter().copied();
    while let Some(argument) = arguments.next() {
        let trimmed_arg = argument.trim();
        if trimmed_arg == "--" {
            values.args.push("--");
            values.args.extend(arguments);
            break;
        }
        if let Some(handled) = inline_value(&mut values, trimmed_arg) {
            handled?;
            continue;
        }
        let field = match trimmed_arg {
            "--write-deps" => &mut values.write_deps,
            "--dependents-via" => &mut values.dependents_via,
            _ => {
                values.args.push(argument);
                continue;
            }
        };
        let value = arguments.next()?;
        set_adoption_slot(field, value)?;
    }
    Some(values)
}
/// Parses an inline `--write-deps=<val>` or `--dependents-via=<val>` flag into `values`.
#[inline]
fn inline_value(values: &mut Values<'_>, argument: &str) -> Option<Option<()>> {
    if let Some(val) = argument.strip_prefix("--write-deps=") {
        return Some(set_adoption_slot(&mut values.write_deps, val));
    }
    argument
        .strip_prefix("--dependents-via=")
        .map(|val| set_adoption_slot(&mut values.dependents_via, val))
}
/// Validates and stores a non-empty comma-separated argument into `field`.
#[inline]
fn set_adoption_slot(field: &mut Option<String>, value: &str) -> Option<()> {
    let trimmed = value.trim();
    if field.is_some()
        || trimmed.contains('\0')
        || trimmed.starts_with('-')
        || trimmed.len() > 4096
        || !trimmed
            .split(',')
            .any(|item| !item.trim().is_empty())
    {
        return None;
    }
    *field = Some(trimmed.to_owned());
    Some(())
}
impl AdoptionOptions {
    /// Parses [`AdoptionOptions`] from CLI `flags` and optional `write_deps`.
    #[inline]
    pub(super) fn parse(flags: &[&str], write_deps: Option<String>) -> Self {
        Self {
            track_only: flags.contains(&"--track-only"),
            write_to_empty_dir: flags.contains(&"--write-to-empty-dir"),
            write_deps,
        }
    }
    #[must_use]
    #[inline]
    pub fn request(&self) -> Value {
        json!({"trackOnly":self.track_only,"writeToEmptyDir":self.write_to_empty_dir,"writeDeps":self.write_deps})
    }
}
impl DependentsOptions {
    #[inline]
    pub(super) fn parse(flags: &[&str], via: Option<String>) -> Self {
        Self {
            enabled: flags.contains(&"--dependents"),
            via,
            all: flags.contains(&"--dependents-all"),
            silent: flags.contains(&"--silent"),
        }
    }
    #[must_use]
    #[inline]
    pub const fn active(&self) -> bool {
        self.enabled || self.via.is_some() || self.all
    }
    #[inline]
    pub(super) const fn valid(&self, ids: &[String]) -> bool {
        ids.is_empty() || !self.active() || self.silent
    }
    #[must_use]
    #[inline]
    pub fn request(&self) -> Value {
        let via = self.via
            .as_deref()
            .map_or_else(Vec::new, |via| {
                via.split(',')
                    .map(str::trim)
                    .filter(|item| !item.is_empty())
                    .collect()
            });
        json!({"enabled":self.active(),"via":via,"silent":self.silent})
    }
}
