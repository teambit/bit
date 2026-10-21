//! The snap and tag reports: the engine's result, validated, and
//! `snapResultReport` and `tagResultReport` of `@teambit/snapping` format it.

pub use labels::{Labels, PERSIST_TAG, SNAP, SOFT_TAG, TAG};

mod labels;

use super::{format::Formatter, results::Report};
use crate::commands::{
    color::Chalk,
    ids::Id,
    status::js::{array, decline, object, text},
};
use serde_json::Value;
use std::{cmp::Reverse, collections::HashSet, fmt::Write, io};

/// The engine's result, validated.
struct Versioned<'l> {
    labels: &'l Labels,
    selected: Vec<Id>,
    added: Vec<Id>,
    removed: Vec<Id>,
    /// Each automatic component and the components that triggered it.
    automatic: Vec<(Id, Vec<Id>)>,
    /// Dependents whose config pins the version of a tagged/snapped dependency.
    pinned: Vec<(Id, Vec<String>)>,
    warnings: Vec<String>,
    /// `(laneName, totalComponentsCount)`.
    summary: (Option<String>, u64),
}

pub fn format(result: &Value, chalk: Chalk, labels: &Labels) -> io::Result<Report> {
    if result.is_null() {
        return Ok(Report { data: chalk.yellow(labels.nothing), code: 0, details: None });
    }
    let versioned = hydrate(result, labels)?;
    let root = result
        .get("autoAddedWorkspaceRoot")
        .filter(|root| !root.is_null())
        .map(|root| Id::parse(text(Some(root))?))
        .transpose()?;
    Ok(versioned.report(&Formatter::new(chalk), root.as_ref()))
}

fn hydrate<'l>(value: &Value, labels: &'l Labels) -> io::Result<Versioned<'l>> {
    let map = object(value)?;
    let total = header(map, labels)?;
    let selected = versions(ids(map.get(labels.versioned))?, labels)?;
    let added = ids(map.get("newComponents"))?;
    let removed = if labels.tag { Vec::new() } else { ids(map.get("removedComponents"))? };
    let selected_names: HashSet<String> = selected
        .iter()
        .map(Id::without_version)
        .collect();
    if added
        .iter()
        .chain(&removed)
        .any(|id| !selected_names.contains(&id.without_version()))
    {
        return Err(decline("native snap new components"));
    }
    let automatic = array(map.get(labels.automatic), "automatic components")?
        .iter()
        .map(|row| automatic_row(row, &selected_names, labels))
        .collect::<io::Result<Vec<_>>>()?;
    let pinned = pinned_dependents(map.get("dependentsWithPinnedDeps"))?;
    let warnings = warnings(map.get("warnings"), labels)?;
    let versioned = Versioned {
        labels,
        selected,
        added,
        removed,
        automatic,
        pinned,
        warnings,
        summary: (
            map.get("laneName")
                .and_then(Value::as_str)
                .map(str::to_string),
            total,
        ),
    };
    versioned.validate_overlaps()?;
    Ok(versioned)
}

fn pinned_dependents(value: Option<&Value>) -> io::Result<Vec<(Id, Vec<String>)>> {
    let Some(value) = value else { return Ok(Vec::new()) };
    array(Some(value), "dependents with pinned dependencies")?
        .iter()
        .map(|row| {
            let map = object(row)?;
            let id = Id::parse(text(map.get("id"))?)?;
            let deps = array(map.get("pinnedDependencies"), "pinned dependencies")?
                .iter()
                .map(|dep| text(Some(dep)).map(str::to_string))
                .collect::<io::Result<Vec<_>>>()?;
            Ok((id, deps))
        })
        .collect()
}

/// The result's keys, lane, total and (for a tag) `isSoftTag: false`.
fn header(map: &serde_json::Map<String, Value>, labels: &Labels) -> io::Result<u64> {
    let known = |key: &str| {
        key == labels.versioned
            || key == labels.automatic
            || labels.others.contains(&key)
            || key == "autoAddedWorkspaceRoot"
            || (labels.tag && key == "isSoftTag")
    };
    let lane = map.get("laneName").unwrap_or(&Value::Null);
    let soft = labels.tag && map.get("isSoftTag") != Some(&Value::Bool(labels.soft()));
    if map.keys().any(|key| !known(key)) || !(lane.is_null() || lane.is_string()) || soft {
        return Err(decline("native snap report"));
    }
    let total = map
        .get("totalComponentsCount")
        .and_then(Value::as_u64)
        .filter(|total| (1..=4096).contains(total));
    total.ok_or_else(|| decline("native snap report"))
}

/// Tags must carry semver versions.
fn versions(ids: Vec<Id>, labels: &Labels) -> io::Result<Vec<Id>> {
    let semver = |id: &Id| {
        id.version
            .as_deref()
            .is_some_and(|version| node_semver::npm::valid(version).is_some())
    };
    if labels.tag && !labels.soft() && !ids.iter().all(semver) {
        return Err(decline("native tag version"));
    }
    Ok(ids)
}

/// A tag's warnings: strings.
fn warnings(value: Option<&Value>, labels: &Labels) -> io::Result<Vec<String>> {
    if !labels.tag {
        return Ok(Vec::new());
    }
    array(value, "warnings")?
        .iter()
        .map(|warning| text(Some(warning)).map(str::to_string))
        .collect()
}

fn automatic_row(
    row: &Value,
    selected: &HashSet<String>,
    labels: &Labels,
) -> io::Result<(Id, Vec<Id>)> {
    let map = object(row)?;
    if map
        .keys()
        .any(|key| key != "id" && key != "triggeredBy")
    {
        return Err(decline("native snap automatic component"));
    }
    let id = versions(vec![Id::parse(text(map.get("id"))?)?], labels)?.remove(0);
    let triggered = ids(map.get("triggeredBy"))?;
    if triggered.is_empty()
        || triggered
            .iter()
            .any(|trigger| !selected.contains(&trigger.without_version()))
    {
        return Err(decline("native snap trigger"));
    }
    Ok((id, triggered))
}

/// Distinct ids, at most 4096.
fn ids(value: Option<&Value>) -> io::Result<Vec<Id>> {
    let rows = array(value, "native snap identities")?;
    if rows.len() > 4096 {
        return Err(decline("native snap identities"));
    }
    let mut seen = HashSet::new();
    rows.iter()
        .map(|row| {
            let id = Id::parse(text(Some(row))?)?;
            if !seen.insert(id.without_version()) {
                return Err(decline("native snap duplicate identity"));
            }
            Ok(id)
        })
        .collect()
}

impl Versioned<'_> {
    /// An automatic id that is also selected must be a new component with
    /// the same version, and the total counts each component once.
    fn validate_overlaps(&self) -> io::Result<()> {
        let added: HashSet<String> = self.added
            .iter()
            .map(Id::without_version)
            .collect();
        let mut persisted: HashSet<String> = self.selected
            .iter()
            .map(Id::without_version)
            .collect();
        for (id, _) in &self.automatic {
            let name = id.without_version();
            let overlap = self.selected
                .iter()
                .find(|component| component.without_version() == name);
            if overlap.is_some_and(|overlap| {
                !added.contains(&name) || overlap.display() != id.display()
            }) {
                return Err(decline("native snap overlapping automatic identity"));
            }
            persisted.insert(name);
        }
        if persisted.len() as u64 != self.summary.1 {
            return Err(decline("native snap component count"));
        }
        Ok(())
    }

    /// `snapResultReport` / `tagResultReport`.
    fn report(&self, format: &Formatter, root: Option<&Id>) -> Report {
        let verb = if self.labels.tag { "tagged" } else { "snapped" };
        let root = root.map_or_else(String::new, |root|format.hint(&format!("({} is the workspace-root component. it was new or modified, so it was {verb} along: the other components record the root version they were {verb} with)",in_bold(format.chalk,root))));
        let footer = self.footer(format);
        let warnings = self.warnings(format);
        if self.automatic.is_empty() {
            let data = Formatter::join(
                &[self.sections(format, true, &root), vec![warnings, footer]].concat(),
            );
            return Report { data, code: 0, details: None };
        }
        let summary = vec![warnings.clone(), footer.clone()];
        let data = Formatter::join(&[self.sections(format, false, &root), summary].concat());
        let details =
            Formatter::join(&[self.sections(format, true, &root), vec![warnings, footer]].concat());
        Report { data, code: 0, details: Some(details) }
    }

    /// The new and changed components, each with its dependents when `detailed`.
    fn sections(&self, format: &Formatter, detailed: bool, root: &str) -> Vec<String> {
        let added: HashSet<String> = self.added
            .iter()
            .map(Id::without_version)
            .collect();
        let removed: HashSet<String> = self.removed
            .iter()
            .map(Id::without_version)
            .collect();
        let item = |id: &Id| {
            if detailed {
                self.detailed(format, id)
            } else {
                format.item(&in_bold(format.chalk, id))
            }
        };
        let (new, changed): (Vec<&Id>, Vec<&Id>) = self.selected
            .iter()
            .filter(|id| !removed.contains(&id.without_version()))
            .partition(|id| added.contains(&id.without_version()));
        let new: Vec<String> = new.into_iter().map(item).collect();
        let changed: Vec<String> = changed.into_iter().map(item).collect();
        let removed: Vec<String> = self.removed
            .iter()
            .map(|id| Formatter::item_with(&id.without_version(), &format.warn_symbol()))
            .collect();
        let (new_title, new_desc) = self.labels.section(true);
        let (changed_title, changed_desc) = self.labels.section(false);
        vec![
            format.section(new_title, new_desc, &new),
            format.section(changed_title, changed_desc, &changed),
            root.to_string(),
            if !detailed && !self.automatic.is_empty() {
                self.automatic_section(format)
            } else {
                String::new()
            },
            self.pinned_section(format),
            format.section("removed components", "", &removed),
        ]
    }

    fn pinned_section(&self, format: &Formatter) -> String {
        if self.pinned.is_empty() {
            return String::new();
        }
        let action = if self.labels.tag { "tagged" } else { "snapped" };
        let items: Vec<String> = self.pinned
            .iter()
            .map(|(id, deps)| {
                let text = format!(
                    "{} {}",
                    in_bold(format.chalk, id),
                    format.chalk.dim(&format!("({})", deps.join(", "))),
                );
                Formatter::item_with(&text, &format.warn_symbol())
            })
            .collect();
        let section = format.section(
            &format!("dependents not auto-{action}"),
            &format!(r#"their config sets the version of the {action} dependency ("bit deps set", variants or env), so they keep using it"#),
            &items,
        );
        let hint = format.hint(r#"(to use the workspace version, remove the version from the config, e.g. "bit deps unset <component> <package>")"#);
        format!("{section}\n{hint}")
    }

    /// `formatCompDetailed`.
    fn detailed(&self, format: &Formatter, id: &Id) -> String {
        let mut output = format.item(&in_bold(format.chalk, id));
        let automatic: Vec<String> = self.automatic
            .iter()
            .filter(|(_, triggered)| {
                triggered
                    .iter()
                    .any(|trigger| trigger.same_without_version(id))
            })
            .map(|(automatic, _)| automatic.display())
            .collect();
        if automatic.is_empty() {
            return output;
        }
        let count =
            if self.labels.tag { String::new() } else { format!(" ({} total)", automatic.len()) };
        let _ = write!(
            output,
            "\n     {}{count}:\n       {}",
            self.labels.dependents,
            automatic.join("\n       "),
        );
        output
    }

    /// The automatic dependents counted per scope, the largest first.
    fn automatic_section(&self, format: &Formatter) -> String {
        let mut counts: Vec<(&str, usize)> = Vec::new();
        for (id, _) in &self.automatic {
            match counts
                .iter_mut()
                .find(|(scope, _)| *scope == id.scope())
            {
                Some((_, count)) => *count += 1,
                None => counts.push((id.scope(), 1)),
            }
        }
        counts.sort_by_key(|(_, count)| Reverse(*count));
        let mut shown: Vec<String> = counts
            .iter()
            .take(4)
            .map(|(scope, count)| format!("{scope} ({count})"))
            .collect();
        if counts.len() > 4 {
            shown.push(format!("+ {} more scopes", counts.len() - 4));
        }
        let title = format.title(&format!("{} ({})", self.labels.dependents, self.automatic.len()));
        let hint = format.details_hint(&format!("full list of {}", self.labels.dependents));
        format!("{title}\n   {}\n{hint}", shown.join(" · "))
    }

    /// `warnings.map(w => warnSymbol + yellow(w))`.
    fn warnings(&self, format: &Formatter) -> String {
        let lines: Vec<String> = self.warnings
            .iter()
            .map(|warning| format!("{} {}", format.warn_symbol(), format.chalk.yellow(warning)))
            .collect();
        lines.join("\n")
    }

    fn footer(&self, format: &Formatter) -> String {
        let lane = self.summary.0
            .as_ref()
            .map_or_else(String::new, |lane| format!(r#" on "{lane}" lane"#));
        let summary = format.success_summary(&format!(
            "{} component(s) {}{lane}",
            self.summary.1, self.labels.verb,
        ));
        let explanation = format.hint(self.labels.explanation);
        if self.labels.soft() {
            format!("{summary}\n{explanation}\n{}", format.chalk.bold("keep in mind that this is a soft-tag (changes recorded to be tagged), to persist the changes use --persist flag"))
        } else {
            format!("{summary}\n{explanation}")
        }
    }
}

/// `compInBold(id)`.
fn in_bold(chalk: Chalk, id: &Id) -> String {
    let version = id.version
        .as_deref()
        .filter(|_| id.has_version())
        .map_or_else(String::new, |version| format!("@{version}"));
    format!("{}{version}", chalk.bold(&id.without_version()))
}

#[cfg(test)]
mod versions_tests;
