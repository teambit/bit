//! The snap and tag reports: the engine's result, validated, and
//! `snapResultReport` and `tagResultReport` of `@teambit/snapping` format it.

use super::{format::Formatter, results::Report};
use crate::commands::{
    color::Chalk,
    ids::Id,
    status::js::{array, decline, object, text},
};
use serde_json::Value;
use std::{cmp::Reverse, collections::HashSet, fmt::Write, io};

/// What differs between the snap and the tag report.
pub struct Labels {
    /// `snappedComponents` or `taggedComponents`.
    versioned: &'static str,
    /// `autoSnappedResults` or `autoTaggedResults`.
    automatic: &'static str,
    /// The other keys a result may carry.
    others: [&'static str; 3],
    /// `NOTHING_TO_SNAP_MSG` or `NOTHING_TO_TAG_MSG`.
    nothing: &'static str,
    /// `AUTO_SNAPPED_MSG` or `AUTO_TAGGED_MSG`.
    dependents: &'static str,
    /// `snapped` or `tagged`.
    verb: &'static str,
    explanation: &'static str,
    /// A tag: semver versions only, warnings, and uncounted dependents in
    /// the detailed listing.
    tag: bool,
}

pub const SNAP: Labels = Labels {
    versioned: "snappedComponents",
    automatic: "autoSnappedResults",
    others: ["newComponents", "laneName", "totalComponentsCount"],
    nothing: "nothing to snap",
    dependents: "auto-snapped dependents",
    verb: "snapped",
    explanation: "(use \"bit export\" to push these components to a remote)\n(use \"bit reset\" to unstage all local versions, or \"bit reset --head\" to only unstage the latest local snap)",
    tag: false,
};

pub const TAG: Labels = Labels {
    versioned: "taggedComponents",
    automatic: "autoTaggedResults",
    others: ["newComponents", "warnings", "totalComponentsCount"],
    nothing: "nothing to tag",
    dependents: "auto-tagged dependents",
    verb: "tagged",
    explanation: "(use \"bit export\" to push these components to a remote)\n(use \"bit reset\" to unstage versions)",
    tag: true,
};

/// The engine's result, validated.
struct Versioned<'l> {
    labels: &'l Labels,
    selected: Vec<Id>,
    added: Vec<Id>,
    /// Each automatic component and the components that triggered it.
    automatic: Vec<(Id, Vec<Id>)>,
    lane: Option<String>,
    warnings: Vec<String>,
    total: u64,
}

pub fn format(result: &Value, chalk: Chalk, labels: &Labels) -> io::Result<Report> {
    if result.is_null() {
        return Ok(Report { data: chalk.yellow(labels.nothing), code: 0, details: None });
    }
    let versioned = hydrate(result, labels)?;
    Ok(versioned.report(&Formatter::new(chalk)))
}

fn hydrate<'l>(value: &Value, labels: &'l Labels) -> io::Result<Versioned<'l>> {
    let map = object(value)?;
    let total = header(map, labels)?;
    let selected = versions(ids(map.get(labels.versioned))?, labels)?;
    let added = ids(map.get("newComponents"))?;
    let selected_names: HashSet<String> = selected
        .iter()
        .map(Id::without_version)
        .collect();
    if added
        .iter()
        .any(|id| !selected_names.contains(&id.without_version()))
    {
        return Err(decline("native snap new components"));
    }
    let automatic = array(map.get(labels.automatic), "automatic components")?
        .iter()
        .map(|row| automatic_row(row, &selected_names, labels))
        .collect::<io::Result<Vec<_>>>()?;
    let warnings = warnings(map.get("warnings"), labels)?;
    let lane = map
        .get("laneName")
        .and_then(Value::as_str)
        .map(str::to_string);
    let versioned = Versioned { labels, selected, added, automatic, lane, warnings, total };
    versioned.validate_overlaps()?;
    Ok(versioned)
}

/// The result's keys, lane, total and (for a tag) `isSoftTag: false`.
fn header(map: &serde_json::Map<String, Value>, labels: &Labels) -> io::Result<u64> {
    let known = |key: &str| {
        key == labels.versioned
            || key == labels.automatic
            || labels.others.contains(&key)
            || (labels.tag && key == "isSoftTag")
    };
    let lane = map.get("laneName").unwrap_or(&Value::Null);
    let soft = labels.tag && map.get("isSoftTag") != Some(&Value::Bool(false));
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
    if labels.tag && !ids.iter().all(semver) {
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
        if persisted.len() as u64 != self.total {
            return Err(decline("native snap component count"));
        }
        Ok(())
    }

    /// `snapResultReport` / `tagResultReport`.
    fn report(&self, format: &Formatter) -> Report {
        let footer = self.footer(format);
        let warnings = self.warnings(format);
        if self.automatic.is_empty() {
            let data =
                Formatter::join(&[self.sections(format, true), vec![warnings, footer]].concat());
            return Report { data, code: 0, details: None };
        }
        let summary = vec![self.automatic_section(format), warnings.clone(), footer.clone()];
        let data = Formatter::join(&[self.sections(format, false), summary].concat());
        let details =
            Formatter::join(&[self.sections(format, true), vec![warnings, footer]].concat());
        Report { data, code: 0, details: Some(details) }
    }

    /// The new and changed components, each with its dependents when `detailed`.
    fn sections(&self, format: &Formatter, detailed: bool) -> Vec<String> {
        let added: HashSet<String> = self.added
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
            .partition(|id| added.contains(&id.without_version()));
        let new: Vec<String> = new.into_iter().map(item).collect();
        let changed: Vec<String> = changed.into_iter().map(item).collect();
        vec![
            format.section("new components", "first version for components", &new),
            format.section("changed components", "components that got a version bump", &changed),
        ]
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
        let lane = self.lane
            .as_ref()
            .map_or_else(String::new, |lane| format!(r#" on "{lane}" lane"#));
        let summary = format.success_summary(&format!(
            "{} component(s) {}{lane}",
            self.total, self.labels.verb,
        ));
        format!("{summary}\n{}", format.hint(self.labels.explanation))
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
