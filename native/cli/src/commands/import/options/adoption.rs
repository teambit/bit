//! Import adoption and noninteractive reverse-graph selection flags.
use serde_json::{Value, json};

#[derive(Debug, Default, PartialEq, Eq)]
pub struct AdoptionOptions {
    pub track_only: bool,
    pub write_to_empty_dir: bool,
    pub write_deps: Option<String>,
}
#[derive(Debug, Default, PartialEq, Eq)]
pub struct DependentsOptions {
    pub enabled: bool,
    pub via: Option<String>,
    pub all: bool,
    pub silent: bool,
}
pub(super) struct Values<'a> {
    pub args: Vec<&'a str>,
    pub write_deps: Option<String>,
    pub dependents_via: Option<String>,
}
pub(super) fn values<'a>(args: &[&'a str]) -> Option<Values<'a>> {
    let mut values = Values { args: Vec::new(), write_deps: None, dependents_via: None };
    let mut arguments = args.iter();
    while let Some(argument) = arguments.next() {
        if let Some(handled) = inline_value(&mut values, argument) {
            handled?;
            continue;
        }
        let field = match *argument {
            "--write-deps" => &mut values.write_deps,
            "--dependents-via" => &mut values.dependents_via,
            value => {
                values.args.push(value);
                continue;
            }
        };
        let value = *arguments.next()?;
        set_adoption_slot(field, value)?;
    }
    Some(values)
}
fn inline_value(values: &mut Values<'_>, argument: &str) -> Option<Option<()>> {
    if let Some(val) = argument.strip_prefix("--write-deps=") {
        return Some(set_adoption_slot(&mut values.write_deps, val));
    }
    argument
        .strip_prefix("--dependents-via=")
        .map(|val| set_adoption_slot(&mut values.dependents_via, val))
}
fn set_adoption_slot(field: &mut Option<String>, value: &str) -> Option<()> {
    if field.is_some() || value.is_empty() || value.starts_with('-') || value.len() > 4096 {
        return None;
    }
    *field = Some(value.to_owned());
    Some(())
}
impl AdoptionOptions {
    pub(super) fn parse(flags: &[&str], write_deps: Option<String>) -> Self {
        Self {
            track_only: flags.contains(&"--track-only"),
            write_to_empty_dir: flags.contains(&"--write-to-empty-dir"),
            write_deps,
        }
    }
    pub fn request(&self) -> Value {
        json!({"trackOnly":self.track_only,"writeToEmptyDir":self.write_to_empty_dir,"writeDeps":self.write_deps})
    }
}
impl DependentsOptions {
    pub(super) fn parse(flags: &[&str], via: Option<String>) -> Self {
        Self {
            enabled: flags.contains(&"--dependents"),
            via,
            all: flags.contains(&"--dependents-all"),
            silent: flags.contains(&"--silent"),
        }
    }
    pub fn active(&self) -> bool {
        self.enabled || self.via.is_some() || self.all
    }
    pub(super) fn valid(&self, ids: &[String]) -> bool {
        ids.is_empty() || !self.active() || self.silent
    }
    pub fn request(&self) -> Value {
        let via = self.via
            .as_deref()
            .map_or_else(Vec::new, |via| via.split(',').map(str::trim).collect());
        json!({"enabled":self.active(),"via":via,"silent":self.silent})
    }
}
