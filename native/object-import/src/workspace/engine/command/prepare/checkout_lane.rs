use super::{Operation, Prepare, selected};
use crate::{
    command_import,
    workspace::engine::{client_status::config, invalid},
};
use serde_json::{Value, json};
use std::io;

#[derive(Default)]
struct Additions {
    names: Vec<String>,
    destinations: Vec<Value>,
    targets: Vec<Value>,
    tracked: Vec<Value>,
    prospective: Vec<Value>,
}

struct Candidates<'a> {
    selected: std::collections::HashSet<String>,
    tracked: std::collections::HashSet<String>,
    targets: &'a [Value],
    workspace_only: bool,
}

pub(super) fn attach(
    request: &Prepare,
    context: &mut Value,
    imported: Option<&mut command_import::PreparedImport>,
) -> io::Result<()> {
    if request.operation != Operation::Checkout {
        return Ok(());
    }
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    if bitmap.get("_bit_lane").is_none() {
        if request.options.workspace_only {
            return Err(invalid("checkout workspace-only requires a lane"));
        }
        return Ok(());
    }
    let current_id = super::super::lane_context::current_id(&bitmap, &context["scope"])?;
    let imported = imported.ok_or_else(|| invalid("checkout lane import owner"))?;
    let current = if request.options.to.as_deref() == Some("head") {
        imported.resolve_other_lane(&current_id, false)?
    } else {
        imported.load_lane(&current_id)?
    }
    .ok_or_else(|| invalid("checkout current Lane absent"))?;
    if !imported.lane_import_histories().is_empty() {
        return Err(invalid("checkout fetched lane history requires canonical handling"));
    }
    context["lane"] = json!({"currentId":current_id,"current":current});
    let additions = if request.options.to.as_deref() == Some("head") {
        additions(request, context, imported, &bitmap, &current)?
    } else {
        Additions::default()
    };
    context["lane"]["newFromLane"] = json!(additions.names);
    context["lane"]["additions"] = json!(additions.destinations);
    context["lane"]["addedTargets"] = json!(additions.targets);
    context["lane"]["trackedTargets"] = json!(additions.tracked);
    Ok(())
}

fn additions(
    request: &Prepare,
    context: &Value,
    imported: &mut command_import::PreparedImport,
    bitmap: &Value,
    current: &command_import::lane::Record,
) -> io::Result<Additions> {
    let selected = selected(request, context)?
        .into_iter()
        .filter_map(|target| target["identity"].as_str().map(str::to_owned))
        .collect::<std::collections::HashSet<_>>();
    let settings = config::configuration_for_command(&request.root, true)?;
    let bitmap = super::super::lane_context::visibility::identity_bitmap(bitmap, &settings)?;
    let candidates = Candidates {
        selected,
        tracked: bitmap_identities(&bitmap)?,
        targets: context["targets"].as_array().ok_or_else(|| invalid("checkout targets"))?,
        workspace_only: request.options.workspace_only,
    };
    let mut result = Additions::default();
    for entry in command_import::lane::entries(&current.value)? {
        collect_candidate(&entry, imported, &candidates, &mut result)?;
    }
    if request.options.workspace_only {
        return Ok(result);
    }
    result.destinations = super::super::lane_context::additions::prepare_switch(
        imported,
        &request.root,
        &bitmap,
        &settings,
        &result.prospective,
    )?;
    result.targets =
        super::super::lane_context::additions::targets(&result.destinations, &result.prospective);
    Ok(result)
}

fn collect_candidate(
    entry: &command_import::lane::Entry,
    imported: &mut command_import::PreparedImport,
    candidates: &Candidates<'_>,
    result: &mut Additions,
) -> io::Result<()> {
    if candidates.selected.contains(&entry.identity) || entry.hidden {
        return Ok(());
    }
    let version = imported.lane_version(&entry.head)?;
    if super::super::selection::removed(&version)? {
        return Ok(());
    }
    result.names.push(format!("{}@{}", entry.identity, entry.head));
    if candidates.workspace_only {
        return Ok(());
    }
    if candidates.tracked.contains(&entry.identity) {
        let target = candidates.targets
            .iter()
            .find(|row| row["identity"] == entry.identity)
            .ok_or_else(|| invalid("checkout inactive lane row requires canonical writer"))?;
        if target["version"] != entry.head {
            return Err(invalid("checkout tracked lane version requires canonical writer"));
        }
        result.tracked.push(target.clone());
        return Ok(());
    }
    result.prospective.push(json!({"identity":entry.identity,"head":entry.head,
        "visible":false,"hidden":false,"currentIdPresent":false,"bitmapPresent":false}));
    Ok(())
}

pub(super) fn bitmap_identities(bitmap: &Value) -> io::Result<std::collections::HashSet<String>> {
    let rows = bitmap.as_object().ok_or_else(|| invalid("checkout lane bitmap"))?;
    rows.iter()
        .filter(|(key, _)| !matches!(key.as_str(), "$schema-version" | "_bit_lane"))
        .map(|(_, row)| {
            let scope = row["scope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
                .or_else(|| row["defaultScope"].as_str())
                .ok_or_else(|| invalid("checkout lane bitmap scope"))?;
            let name = row["name"].as_str().ok_or_else(|| invalid("checkout lane bitmap name"))?;
            Ok(format!("{scope}/{name}"))
        })
        .collect()
}
