//! Lane readme and hidden update-dependent metadata for inspection.
use super::{Chalk, DELETED_DATA_SCHEMA, Formatter, LaneData, array, decline, text};
use serde_json::{Value, json};
use std::io;

/// The lanes `scope.json` tracks: `localLane` per remote lane.
pub(in crate::commands::lane) struct Tracking(pub(in crate::commands::lane) Vec<Value>);

impl Tracking {
    pub(in crate::commands::lane) fn read(scope: &Value) -> Self {
        Self(
            scope["lanes"]["tracking"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
        )
    }

    /// `getLocalTrackedLaneByRemoteName(name, scope)`.
    pub(in crate::commands::lane) fn alias(&self, name: &str, scope: &str) -> Option<String> {
        let name = name.trim();
        let scope = scope.trim();
        self.0
            .iter()
            .find(|row| {
                row["remoteLane"].as_str().map(str::trim) == Some(name)
                    && row["remoteScope"].as_str().map(str::trim) == Some(scope)
            })
            .and_then(|row| row["localLane"].as_str())
            .map(str::trim)
            .filter(|local| !local.is_empty())
            .map(str::to_string)
    }
}

/// A lane of the index: its id, alias and components that are not deleted.
pub(in crate::commands::lane::list) fn lane(
    row: &Value,
    tracking: &Tracking,
) -> io::Result<LaneData> {
    let value = &row["lane"];
    if value["schema"] != DELETED_DATA_SCHEMA {
        return Err(decline("a lane Node migrates to record deleted components"));
    }
    let name = text(value.get("name"))?;
    let scope = text(value.get("scope"))?;
    let components = array(value.get("components"), "lane components")?
        .iter()
        .filter(|component| component["isDeleted"] != true)
        .map(|component| {
            Ok(json!({
                "id": scoped_id(&component["id"])?,
                "head": text(component.get("head"))?,
            }))
        })
        .collect::<io::Result<Vec<_>>>()?;
    let update_dependents = updates(value)?;
    let readme_component = readme(value)?;
    Ok(LaneData {
        id: json!({"name": name, "scope": scope}),
        alias: tracking
            .alias(name, scope)
            .filter(|alias| alias != name),
        components,
        update_dependents,
        readme_component,
        is_merged: row["isMerged"].as_bool(),
        lane: Some((value["log"].clone(), text(row.get("hash"))?.to_string())),
    })
}

pub(super) fn updates(value: &Value) -> io::Result<Option<Vec<Value>>> {
    let update_dependents = value
        .get("updateDependents")
        .filter(|value| !value.is_null())
        .map(|value| {
            array(Some(value), "lane update-dependents")?
                .iter()
                .map(|id| {
                    let id = text(Some(id))?.trim();
                    let (identity, head) =
                        id.rsplit_once('@').ok_or_else(|| decline("lane update-dependent id"))?;
                    let (identity, head) = (identity.trim(), head.trim());
                    let (scope, name) = identity
                        .split_once('/')
                        .ok_or_else(|| decline("lane update-dependent identity"))?;
                    if scope.trim().is_empty() || name.trim().is_empty() || head.is_empty() {
                        return Err(decline("lane update-dependent identity"));
                    }
                    Ok(json!({"id": identity, "head": head}))
                })
                .collect::<io::Result<Vec<_>>>()
        })
        .transpose()?
        .filter(|updates| !updates.is_empty());
    Ok(update_dependents)
}

fn scoped_id(id: &Value) -> io::Result<String> {
    if let Some(raw) = id.as_str() {
        let raw = raw.trim();
        let (scope, name) = raw
            .rsplit_once('@')
            .map_or(raw, |(bare, _)| bare.trim())
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| decline("lane component identity"))?;
        return Ok(format!("{scope}/{name}"));
    }
    let scope = text(id.get("scope"))?.trim();
    let name = text(id.get("name"))?.trim();
    if scope.is_empty() || name.is_empty() {
        return Err(decline("lane component identity"));
    }
    Ok(format!("{scope}/{name}"))
}

pub(super) fn readme(value: &Value) -> io::Result<Option<Value>> {
    value
        .get("readmeComponent")
        .filter(|value| !value.is_null())
        .map(|readme| {
            let mut output = json!({"id": scoped_id(&readme["id"])?});
            if let Some(head) = readme
                .get("head")
                .filter(|head| !head.is_null())
            {
                output["head"] = json!(text(Some(head))?);
            }
            Ok::<_, io::Error>(output)
        })
        .transpose()
}

pub(super) fn readme_report(lane: &LaneData, chalk: Chalk) -> String {
    let Some(readme) = &lane.readme_component else { return String::new() };
    let id = readme["id"].as_str().unwrap_or_default();
    if let Some(head) = readme["head"].as_str() {
        return format!(" readme: {id} - {head}");
    }
    let full_name = id.split_once('/').map_or(id, |(_, name)| name);
    format!(
        r#" {} readme: {id} - (unsnapped) - use "bit snap {full_name}" to snap before exporting"#,
        Formatter::new(chalk).warn_symbol(),
    )
}

pub(in crate::commands::lane) fn components_report(lane: &LaneData, format: &Formatter) -> String {
    let items: Vec<_> = lane.components
        .iter()
        .map(|component| {
            format.item(&format!(
                "{} - {}",
                component["id"].as_str().unwrap_or_default(),
                component["head"].as_str().unwrap_or_default(),
            ))
        })
        .collect();
    format.section("components", "", &items)
}

/// `LaneListCmd.report` for compact and detailed lane lists.
pub(super) fn report(
    lanes: &[LaneData],
    current: &Value,
    chalk: Chalk,
    details: bool,
    bare: bool,
) -> String {
    let format = Formatter::new(chalk);
    let current_lane = lanes
        .iter()
        .find(|lane| lane.id == *current);
    let current_output = report_current(current_lane, current, chalk, details, &format);
    let others = report_others(lanes, current, chalk, details, &format);
    let first_hint = if details {
        "use --merged and --not-merged to see which of the lanes is fully merged"
    } else {
        "use 'bit lane list --details' or 'bit lane show <lane-name>' for more info"
    };
    let hints = if bare {
        first_hint.to_owned()
    } else {
        format!(
            "{first_hint}\nswitch lanes using 'bit switch <name>'. create lanes using 'bit lane create <name>'",
        )
    };
    Formatter::join(&[current_output, others, format.hint(&hints)])
}

fn report_current(
    current_lane: Option<&LaneData>,
    current: &Value,
    chalk: Chalk,
    details: bool,
    format: &Formatter,
) -> String {
    // A current lane missing from the index: `laneIdStr` without an alias.
    let current_label = current_lane.map_or_else(
        || {
            if let Some(raw) = current.as_str() {
                return raw.to_owned();
            }
            let name = current["name"].as_str().unwrap_or_default();
            format!("{}/{name}", current["scope"].as_str().unwrap_or_default())
        },
        LaneData::label,
    );
    let readme = current_lane.map_or_else(String::new, |lane| readme_report(lane, chalk));
    let current_output = format!("current lane - {}{readme}", chalk.green(&current_label));
    if !details || current_lane.is_none() {
        return current_output;
    }
    let components = current_lane.map(|lane| components_report(lane, format)).unwrap_or_default();
    format!("{current_output}\n{components}")
}

pub(super) fn report_others(
    lanes: &[LaneData],
    current: &Value,
    chalk: Chalk,
    details: bool,
    format: &Formatter,
) -> String {
    let items: Vec<String> = lanes
        .iter()
        .filter(|lane| lane.id != *current)
        .map(|lane| {
            let readme = readme_report(lane, chalk);
            if details {
                return format!(
                    "> {}{readme}\n{}",
                    chalk.bold(&lane.label()),
                    components_report(lane, format),
                );
            }
            format.item(&format!(
                "{} ({} components){readme}",
                chalk.green(&lane.label()),
                lane.components.len(),
            ))
        })
        .collect();
    if details { items.join("\n\n") } else { format.section("available lanes", "", &items) }
}
