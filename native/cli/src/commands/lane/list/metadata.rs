//! Lane readme and hidden update-dependent metadata for inspection.
use super::{Chalk, Formatter, LaneData, array, decline, text};
use serde_json::{Value, json};
use std::io;

pub(super) fn updates(value: &Value) -> io::Result<Option<Vec<Value>>> {
    let update_dependents = value
        .get("updateDependents")
        .filter(|value| !value.is_null())
        .map(|value| {
            array(Some(value), "lane update-dependents")?
                .iter()
                .map(|id| {
                    let id = text(Some(id))?;
                    let (identity, head) =
                        id.rsplit_once('@').ok_or_else(|| decline("lane update-dependent id"))?;
                    let (scope, name) = identity
                        .split_once('/')
                        .ok_or_else(|| decline("lane update-dependent identity"))?;
                    if scope.is_empty() || name.is_empty() || head.is_empty() {
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

pub(super) fn readme(value: &Value) -> io::Result<Option<Value>> {
    value
        .get("readmeComponent")
        .filter(|value| !value.is_null())
        .map(|readme| {
            let id = &readme["id"];
            let scope = text(id.get("scope"))?;
            let name = text(id.get("name"))?;
            let mut output = json!({"id": format!("{scope}/{name}")});
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
pub(super) fn report(lanes: &[LaneData], current: &Value, chalk: Chalk, details: bool) -> String {
    let format = Formatter::new(chalk);
    let current_lane = lanes
        .iter()
        .find(|lane| lane.id == *current);
    let current_output = report_current(current_lane, current, chalk, details, &format);
    let others = report_others(lanes, current, chalk, details, &format);
    let hints = if details {
        "use --merged and --not-merged to see which of the lanes is fully merged\nswitch lanes using 'bit switch <name>'. create lanes using 'bit lane create <name>'"
    } else {
        "use 'bit lane list --details' or 'bit lane show <lane-name>' for more info\nswitch lanes using 'bit switch <name>'. create lanes using 'bit lane create <name>'"
    };
    Formatter::join(&[current_output, others, format.hint(hints)])
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
