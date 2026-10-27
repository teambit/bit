//! Command lane metadata for native merge and local switch planning.
pub(super) mod visibility;

pub(super) mod additions;

use super::input::Prepare;
use crate::{
    command_import::{
        self,
        lane::{Id, Record},
    },
    workspace::engine::{client_status::config, invalid, status_context},
};
use serde_json::{Value, json};
use std::io;

struct Lanes {
    imported: command_import::PreparedImport,
    current_id: Id,
    other_id: Id,
    current: Option<Record>,
    other: Option<Record>,
    should_squash: bool,
}
pub(super) fn prepare(
    request: &Prepare,
    pool: &rayon::ThreadPool,
) -> io::Result<(Value, Option<command_import::PreparedImport>)> {
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    let mut lanes = load_lanes(request, &bitmap)?;
    refresh_current_main(&mut lanes)?;
    let settings = config::configuration_for_command(&request.root, true)?;
    let targets = visibility::targets(&bitmap, &settings)?;
    let input = status_context::Request {
        root: request.root.clone(),
        home: request.home.clone(),
        history: false,
    };
    let mut context = status_context::metadata_with_targets(&input, pool, &settings, targets)?;
    refresh_other_main(request, &mut lanes, &bitmap, &context["targets"])?;
    let options = request.options.lane.as_ref().unwrap();
    let identities = visibility::identity_bitmap(&bitmap, &settings)?;
    let selected = visibility::selected(
        &mut lanes.imported,
        &identities,
        &context["targets"],
        lanes.current.as_ref(),
        lanes.other.as_ref(),
        &lanes.other_id,
        options.exclude_non_lane_comps,
    )?;
    let inactive = visibility::inactive_targets(&bitmap, &settings, &selected)?;
    let inactive = status_context::metadata_with_targets(&input, pool, &settings, inactive)?;
    let additions = additions::prepare(&mut lanes.imported, &identities, &settings, &selected)?;
    let added = additions::targets(&additions, &selected);
    context["lane"] = json!({"currentId":lanes.current_id,"otherId":lanes.other_id,"current":lanes.current,"other":lanes.other,
        "targets":selected,"inactiveTargets":inactive["targets"],"addedTargets":added,"shouldSquash":lanes.should_squash,"bitmap":bitmap,"additions":additions,
        "fetchedOther":lanes.imported.fetched_lane(),"importHistoryPlans":lanes.imported.lane_import_histories()});
    lanes.imported.validate()?;
    Ok((context, Some(lanes.imported)))
}
fn load_lanes(request: &Prepare, bitmap: &Value) -> io::Result<Lanes> {
    let options = request.options.lane.as_ref().ok_or_else(|| invalid("command lane options"))?;
    let mut imported = command_import::prepare_lane(&request.root, &request.global_remotes_file)?;
    let current_id = current_id(bitmap, &imported.lane_scope()?)?;
    let other_id = imported.resolve_lane(&options.name)?;
    if current_id == other_id || (options.squash && options.no_squash) {
        return Err(invalid("command invalid lane merge"));
    }
    let current = imported.load_lane(&current_id)?;
    if !current_id.is_main() && current.is_none() {
        return Err(invalid("command current Lane absent"));
    }
    let other = imported.resolve_other_lane(&other_id, options.skip_fetch)?;
    let should_squash = options.squash || (current_id.is_main() && !options.no_squash);
    imported.lane_gap_source(&current_id, &other_id, other.as_ref(), should_squash)?;
    Ok(Lanes { imported, current_id, other_id, current, other, should_squash })
}
fn refresh_current_main(lanes: &mut Lanes) -> io::Result<()> {
    if lanes.current_id.is_main()
        && let Some(other) = &lanes.other
    {
        let identities = command_import::lane::entries(&other.value)?
            .into_iter()
            .map(|entry| entry.identity)
            .collect::<Vec<_>>();
        lanes.imported.refresh_lane_main(&identities)?;
    }
    Ok(())
}
fn refresh_other_main(
    request: &Prepare,
    lanes: &mut Lanes,
    bitmap: &Value,
    targets: &Value,
) -> io::Result<()> {
    let options = request.options.lane.as_ref().unwrap();
    if !lanes.other_id.is_main() || options.skip_fetch {
        return Ok(());
    }
    let entries = lanes.current
        .as_ref()
        .map(|lane| command_import::lane::entries(&lane.value))
        .transpose()?
        .unwrap_or_default();
    let visible = targets.as_array().ok_or_else(|| invalid("command visible lane targets"))?;
    let ids =
        visibility::main_identities(bitmap, visible, &entries, options.exclude_non_lane_comps)?;
    lanes.imported.refresh_lane_main(
        &ids.into_iter()
            .map(|(identity, _)| identity)
            .collect::<Vec<_>>(),
    )
}
pub(super) fn current_id(bitmap: &Value, scope: &Value) -> io::Result<Id> {
    let id = if let Some(lane) = bitmap.get("_bit_lane") {
        serde_json::from_value(lane["id"].clone()).map_err(io::Error::other)?
    } else {
        Id {
            scope: scope["name"]
                .as_str()
                .ok_or_else(|| invalid("command lane local scope"))?
                .into(),
            name: "main".into(),
        }
    };
    id.validate()?;
    Ok(id)
}

pub(super) fn validate_additions(
    root: &std::path::Path,
    context: &Value,
    proofs: &mut Vec<crate::workspace::engine::dependency_graph::proof::Proof>,
) -> io::Result<()> {
    use crate::workspace::engine::dependency_graph::proof;
    let lane = context["lane"]["additions"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let scope = context["scopeAdditions"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let stash = context["stashAdditions"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    for row in lane.iter().chain(scope).chain(stash) {
        let relative = row["rootDir"].as_str().ok_or_else(|| invalid("lane addition directory"))?;
        let added = context["lane"]["addedTargets"]
            .as_array()
            .is_some_and(|targets| {
                targets
                    .iter()
                    .any(|target| target["directory"] == relative)
            })
            || scope
                .iter()
                .any(|candidate| candidate["rootDir"] == relative)
            || stash
                .iter()
                .any(|candidate| candidate["rootDir"] == relative);
        if added && directory_metadata(&root.join(relative))?.is_some() {
            return Err(invalid("lane new destination already exists"));
        }
        let mut path = root.to_path_buf();
        for component in std::path::Path::new(relative).components() {
            path.push(component);
            let metadata = directory_metadata(&path)?;
            if proofs.len() >= 16384 {
                return Err(invalid("lane destination proof budget"));
            }
            proofs.push(proof::metadata(&path, metadata.as_ref())?);
        }
    }
    Ok(())
}

fn directory_metadata(path: &std::path::Path) -> io::Result<Option<std::fs::Metadata>> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() => Ok(Some(metadata)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
        _ => Err(invalid("lane addition nonordinary ancestor")),
    }
}
