//! The snap report: `formatRustWorkspaceSnap` validates the engine's
//! result, and `snapResultReport` of `@teambit/snapping` formats it.

use crate::commands::{
    color::Chalk,
    ids::Id,
    status::js::{array, decline, object, text},
    workspace_command::{format::Formatter, results::Report},
};
use serde_json::Value;
use std::{cmp::Reverse, collections::HashSet, fmt::Write, io};

/// `NOTHING_TO_SNAP_MSG`.
const NOTHING_TO_SNAP: &str = "nothing to snap";
/// `AUTO_SNAPPED_MSG`.
const AUTO_SNAPPED: &str = "auto-snapped dependents";
const RESULT_KEYS: [&str; 5] = [
    "snappedComponents",
    "autoSnappedResults",
    "newComponents",
    "laneName",
    "totalComponentsCount",
];

/// The engine's snap result, validated.
struct Snapped {
    selected: Vec<Id>,
    added: Vec<Id>,
    /// Each auto-snapped component and the components that triggered it.
    automatic: Vec<(Id, Vec<Id>)>,
    lane: Option<String>,
    total: u64,
}

pub fn format(result: &Value, chalk: Chalk) -> io::Result<Report> {
    if result.is_null() {
        return Ok(Report { data: chalk.yellow(NOTHING_TO_SNAP), code: 0, details: None });
    }
    let snapped = hydrate(result)?;
    Ok(snapped.report(&Formatter::new(chalk)))
}

fn hydrate(value: &Value) -> io::Result<Snapped> {
    let map = object(value)?;
    let lane = map.get("laneName").unwrap_or(&Value::Null);
    let total = map
        .get("totalComponentsCount")
        .and_then(Value::as_u64)
        .filter(|total| (1..=4096).contains(total));
    if map
        .keys()
        .any(|key| !RESULT_KEYS.contains(&key.as_str()))
        || !(lane.is_null() || lane.is_string())
    {
        return Err(decline("native snap report"));
    }
    let total = total.ok_or_else(|| decline("native snap report"))?;
    let selected = ids(map.get("snappedComponents"))?;
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
    let automatic = array(map.get("autoSnappedResults"), "automatic components")?
        .iter()
        .map(|row| automatic_row(row, &selected_names))
        .collect::<io::Result<Vec<_>>>()?;
    let snapped =
        Snapped { selected, added, automatic, lane: lane.as_str().map(str::to_string), total };
    snapped.validate_overlaps()?;
    Ok(snapped)
}

fn automatic_row(row: &Value, selected: &HashSet<String>) -> io::Result<(Id, Vec<Id>)> {
    let map = object(row)?;
    if map
        .keys()
        .any(|key| key != "id" && key != "triggeredBy")
    {
        return Err(decline("native snap automatic component"));
    }
    let id = Id::parse(text(map.get("id"))?)?;
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

impl Snapped {
    /// An auto-snapped id that is also selected must be a new component
    /// with the same version, and the total counts each component once.
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

    /// `snapResultReport`.
    fn report(&self, format: &Formatter) -> Report {
        let footer = self.footer(format);
        if self.automatic.is_empty() {
            let data = Self::join(&self.sections(format, true), String::new(), footer);
            return Report { data, code: 0, details: None };
        }
        let data = Self::join(
            &self.sections(format, false),
            self.automatic_section(format),
            footer.clone(),
        );
        let details = Self::join(&self.sections(format, true), String::new(), footer);
        Report { data, code: 0, details: Some(details) }
    }

    fn join(sections: &[String; 2], automatic: String, footer: String) -> String {
        Formatter::join(&[sections[0].clone(), sections[1].clone(), automatic, footer])
    }

    /// The new and changed components, each with its auto-snapped
    /// dependents when `detailed`.
    fn sections(&self, format: &Formatter, detailed: bool) -> [String; 2] {
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
        let new: Vec<String> = self.selected
            .iter()
            .filter(|id| added.contains(&id.without_version()))
            .map(item)
            .collect();
        let changed: Vec<String> = self.selected
            .iter()
            .filter(|id| !added.contains(&id.without_version()))
            .map(item)
            .collect();
        [
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
        if !automatic.is_empty() {
            let _ = write!(
                output,
                "\n     {AUTO_SNAPPED} ({} total):\n       {}",
                automatic.len(),
                automatic.join("\n       "),
            );
        }
        output
    }

    /// The auto-snapped dependents counted per scope, the largest first.
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
        let title = format.title(&format!("{AUTO_SNAPPED} ({})", self.automatic.len()));
        let hint = format.details_hint("full list of auto-snapped dependents");
        format!("{title}\n   {}\n{hint}", shown.join(" · "))
    }

    fn footer(&self, format: &Formatter) -> String {
        let lane = self.lane
            .as_ref()
            .map_or_else(String::new, |lane| format!(r#" on "{lane}" lane"#));
        let summary = format.success_summary(&format!("{} component(s) snapped{lane}", self.total));
        let explanation = format.hint(
            "(use \"bit export\" to push these components to a remote)\n(use \"bit reset\" to unstage all local versions, or \"bit reset --head\" to only unstage the latest local snap)",
        );
        format!("{summary}\n{explanation}")
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
mod report_tests;
