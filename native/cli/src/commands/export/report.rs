//! The engine's outbound receipts and
//! `ExportCmd.report` for the exports that run natively: components and lanes,
//! without ejecting or ripple jobs.

mod extra;
#[cfg(test)]
mod report_tests;

use crate::commands::{
    color::Chalk,
    ids::Id,
    status::js::{array, decline, object, text},
    workspace_command::format::Formatter,
};
use serde_json::Value;
use std::{collections::HashSet, io};

/// `commandOutboundPrepare`'s receipt.
pub(super) struct Prepared {
    pub token: String,
    pub central_hub: bool,
    pub nothing_to_export: bool,
    pub count: usize,
    pub scopes: Vec<String>,
    /// Each scope and the objects pushed to it.
    pub transfers: Vec<(String, usize)>,
    pub fork_history: Option<ForkHistory>,
}

pub(super) struct ForkHistory {
    pub parent: String,
    pub external_count: usize,
    pub candidate_count: usize,
}

struct Transfers {
    scopes: Vec<String>,
    items: Vec<(String, usize)>,
}

/// The prepared export, which must own a token, name its scopes and count
/// the objects of each.
pub(super) fn prepared(value: &Value) -> io::Result<Prepared> {
    let token = text(value.get("token"))?;
    let nothing_to_export = value["nothingToExport"]
        .as_bool()
        .ok_or_else(|| decline("native outbound prepare receipt"))?;
    let count = value["componentCount"]
        .as_u64()
        .and_then(|count| usize::try_from(count).ok())
        .ok_or_else(|| decline("native outbound component count"))?;
    let lane = match value.get("lane") {
        Some(Value::String(lane)) if !lane.trim().is_empty() && lane.trim().contains('/') => {
            Some(lane.trim().to_owned())
        }
        Some(Value::Null) | None => None,
        _ => return Err(decline("native outbound lane identity")),
    };
    let transfers = parse_transfers(value)?;
    if value["owner"] != "rust"
        || token.is_empty()
        || nothing_to_export != (count == 0 && lane.is_none())
    {
        return Err(decline("native outbound prepare receipt"));
    }
    let fork_history = parse_fork_history(value.get("forkHistory"), count)?;
    Ok(Prepared {
        token: token.to_string(),
        central_hub: value["centralHub"] == true,
        nothing_to_export,
        count,
        scopes: transfers.scopes,
        transfers: transfers.items,
        fork_history,
    })
}

fn parse_transfers(value: &Value) -> io::Result<Transfers> {
    let scopes = array(value.get("scopes"), "scopes")?
        .iter()
        .map(|scope| text(Some(scope)).map(|raw| raw.trim().to_string()))
        .collect::<io::Result<Vec<_>>>()?;
    let counts = array(value.get("scopeObjectCounts"), "object counts")?;
    if counts.len() != scopes.len() || scopes.iter().any(String::is_empty) {
        return Err(decline("native outbound prepare receipt"));
    }
    let transfers = scopes
        .iter()
        .zip(counts)
        .map(|(scope, objects)| {
            let objects = objects
                .as_u64()
                .and_then(|objects| usize::try_from(objects).ok())
                .ok_or_else(|| decline("native outbound object count"))?;
            Ok((scope.clone(), objects))
        })
        .collect::<io::Result<_>>()?;
    Ok(Transfers { scopes, items: transfers })
}

fn parse_fork_history(value: Option<&Value>, count: usize) -> io::Result<Option<ForkHistory>> {
    let parsed = match value {
        None | Some(Value::Null) => None,
        Some(Value::Object(history)) => {
            let parent = text(history.get("parent"))?;
            let external_count = history
                .get("externalCount")
                .and_then(Value::as_u64)
                .and_then(|count| usize::try_from(count).ok())
                .filter(|external| *external <= count)
                .ok_or_else(|| decline("native outbound fork history count"))?;
            let candidate_count = history
                .get("candidateCount")
                .and_then(Value::as_u64)
                .and_then(|count| usize::try_from(count).ok())
                .filter(|candidates| *candidates <= 4096 && *candidates >= count)
                .ok_or_else(|| decline("native outbound fork candidates"))?;
            if !parent.contains('/') {
                return Err(decline("native outbound fork history parent"));
            }
            Some(ForkHistory { parent: parent.to_owned(), external_count, candidate_count })
        }
        Some(_) => return Err(decline("native outbound fork history")),
    };
    Ok(parsed)
}

/// `commandOutboundFinalize`'s receipt, validated.
pub(super) fn published(value: &Value, token: &str) -> io::Result<Value> {
    let map = object(value)?;
    if map.get("applied") != Some(&Value::Bool(true))
        || value["token"] != token
        || value["owner"] != "rust"
    {
        return Err(decline("native outbound finalize receipt"));
    }
    for field in
        ["componentsIds", "newIdsOnRemote", "nonExistOnBitMap", "removedIds", "laneUpdateIds"]
    {
        scoped_ids(value, field)?;
    }
    for field in ["rippleJobUrls", "missingScope"] {
        for value in array(value.get(field), field)? {
            text(Some(value))?;
        }
    }
    let lanes = array(value.get("exportedLanes"), "exported lanes")?;
    if lanes.len() > 1
        || lanes
            .iter()
            .any(|lane| {
                lane.as_str()
                    .is_none_or(|lane| lane.is_empty() || !lane.contains('/'))
            })
    {
        return Err(decline("native outbound lane receipt"));
    }
    remote_ids(value)?;
    update_ids_valid(value)?;
    Ok(value.clone())
}

fn update_ids_valid(value: &Value) -> io::Result<()> {
    let components: HashSet<_> = array(value.get("componentsIds"), "components")?
        .iter()
        .filter_map(Value::as_str)
        .collect();
    if array(value.get("laneUpdateIds"), "lane updates")?
        .iter()
        .filter_map(Value::as_str)
        .any(|id| !components.contains(id))
    {
        return Err(decline("native outbound update identity"));
    }
    Ok(())
}

/// A receipt field of at most 4096 ids, each with a scope.
fn scoped_ids(value: &Value, field: &str) -> io::Result<()> {
    let ids = array(value.get(field), field)?;
    if ids.len() > 4096 {
        return Err(decline("native outbound identities"));
    }
    for id in ids {
        if Id::parse(text(Some(id))?)?.scope().is_empty() {
            return Err(decline("native outbound identity"));
        }
    }
    Ok(())
}

/// The exported components, unique and without versions, and each remote id
/// a version of one of them.
fn remote_ids(value: &Value) -> io::Result<()> {
    let mut components = HashSet::new();
    for id in array(value.get("componentsIds"), "components")? {
        let id = text(Some(id))?;
        if id.contains('@') || !components.insert(id) {
            return Err(decline("native outbound component identity"));
        }
    }
    for id in array(value.get("newIdsOnRemote"), "remote ids")? {
        let id = Id::parse(text(Some(id))?)?;
        if !id.has_version() || !components.contains(id.without_version().as_str()) {
            return Err(decline("native outbound remote identity"));
        }
    }
    Ok(())
}

pub(super) fn format_with(receipt: &Value, chalk: Chalk, verbose: bool) -> String {
    let ids = |field: &str| extra::ids(receipt, field);
    let components = ids("componentsIds");
    let removed = ids("removedIds");
    let lane = ids("exportedLanes").first().copied();
    if components.is_empty()
        && ids("nonExistOnBitMap").is_empty()
        && ids("missingScope").is_empty()
        && lane.is_none()
    {
        return chalk.yellow("nothing to export");
    }
    let format = Formatter::new(chalk);
    let export_sections = export_sections(receipt, &components, lane, &format, chalk, verbose);
    let removed: Vec<String> = removed
        .iter()
        .map(|id| Formatter::item_with(id, &format.warn_symbol()))
        .collect();
    let removed_title = if lane.is_some() {
        "components removed on the remote lane"
    } else {
        "components removed on the remote"
    };
    let removed = format.section(removed_title, "", &removed);
    Formatter::join(&[
        extra::untracked(receipt, &format),
        extra::missing(receipt, &format),
        export_sections,
        receipt["ejectReport"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        removed,
        extra::cloud(receipt, chalk),
    ])
}

fn export_sections(
    receipt: &Value,
    components: &[&str],
    lane: Option<&str>,
    format: &Formatter,
    chalk: Chalk,
    verbose: bool,
) -> String {
    if components.is_empty() {
        return lane.map_or_else(String::new, |lane| {
            format.section("exported lane", "", &[format.item(&chalk.bold(lane))])
        });
    }
    let update_ids = lane_update_ids(receipt);
    let items: Vec<String> = components
        .iter()
        .filter(|id| !update_ids.contains(*id))
        .map(|id| render_item(receipt, id, format, chalk, verbose))
        .collect();
    let description = lane.map_or_else(
        || "exported the following component(s)".to_string(),
        |lane| format!("exported the lane {} and the following component(s)", chalk.bold(lane)),
    );
    let exported = format.section("exported components", &description, &items);
    let updates: Vec<String> = components
        .iter()
        .filter(|id| update_ids.contains(*id))
        .map(|id| render_item(receipt, id, format, chalk, verbose))
        .collect();
    let updates = format.section(
        "exported updates",
        "impacted dependents pushed to keep the lane consistent (from a 'Snap updates' / local cascade)",
        &updates,
    );
    [exported, updates]
        .into_iter()
        .filter(|section| !section.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn lane_update_ids(receipt: &Value) -> HashSet<&str> {
    receipt["laneUpdateIds"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect()
}

fn render_item(
    receipt: &Value,
    id: &str,
    format: &Formatter,
    chalk: Chalk,
    verbose: bool,
) -> String {
    if !verbose {
        return format.item(&chalk.bold(id));
    }
    let versions = receipt["newIdsOnRemote"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter_map(|value| value.rsplit_once('@'))
        .filter(|(identity, _)| *identity == id)
        .map(|(_, version)| version)
        .collect::<Vec<_>>();
    let versions = if versions.is_empty() { "n/a".to_owned() } else { versions.join(", ") };
    format.item(&format!("{} - {versions}", chalk.bold(id)))
}
