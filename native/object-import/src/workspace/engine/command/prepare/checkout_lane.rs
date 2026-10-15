use super::{Operation, Prepare, selected};
use crate::{
    command_import,
    workspace::engine::{client_status::config, invalid},
};
use serde_json::{Value, json};
use std::io;

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
    let (new_from_lane, additions, added_targets) = if request.options.to.as_deref() == Some("head")
    {
        additions(request, context, imported, &bitmap, &current)?
    } else {
        (Vec::new(), Vec::new(), Vec::new())
    };
    context["lane"]["newFromLane"] = json!(new_from_lane);
    context["lane"]["additions"] = json!(additions);
    context["lane"]["addedTargets"] = json!(added_targets);
    Ok(())
}

fn additions(
    request: &Prepare,
    context: &Value,
    imported: &mut command_import::PreparedImport,
    bitmap: &Value,
    current: &command_import::lane::Record,
) -> io::Result<(Vec<String>, Vec<Value>, Vec<Value>)> {
    let selected = selected(request, context)?
        .into_iter()
        .filter_map(|target| target["identity"].as_str().map(str::to_owned))
        .collect::<std::collections::HashSet<_>>();
    let settings = config::configuration_for_command(&request.root, true)?;
    let bitmap = super::super::lane_context::visibility::identity_bitmap(bitmap, &settings)?;
    let tracked = bitmap_identities(&bitmap)?;
    let mut prospective = Vec::new();
    let mut names = Vec::new();
    for entry in command_import::lane::entries(&current.value)? {
        if selected.contains(&entry.identity) || entry.hidden {
            continue;
        }
        let version = imported.lane_version(&entry.head)?;
        if super::super::selection::removed(&version)? {
            continue;
        }
        names.push(format!("{}@{}", entry.identity, entry.head));
        if !request.options.workspace_only && tracked.contains(&entry.identity) {
            return Err(invalid("checkout lane tracked addition requires canonical writer"));
        }
        prospective.push(json!({"identity":entry.identity,"head":entry.head,
            "visible":false,"hidden":false,"currentIdPresent":false,"bitmapPresent":false}));
    }
    if request.options.workspace_only {
        return Ok((names, Vec::new(), Vec::new()));
    }
    let additions = super::super::lane_context::additions::prepare_switch(
        imported,
        &request.root,
        &bitmap,
        &settings,
        &prospective,
    )?;
    let targets = super::super::lane_context::additions::targets(&additions, &prospective);
    Ok((names, additions, targets))
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
