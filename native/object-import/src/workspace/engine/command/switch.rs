//! Local, ordinary lane switches reuse checkout capture, transition and bitmap publication.
//! Resolve the complete target set before the command retains a writable plan.
use super::{input::Prepare, invalid, prepare, repository};
use crate::{
    command_import,
    workspace::engine::{client_status::config, status_context},
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
};

struct LaneSelection {
    imported: command_import::PreparedImport,
    bitmap: Value,
    current: command_import::lane::Id,
    destination: command_import::lane::Id,
    lane: Option<command_import::lane::Record>,
    current_lane: Option<command_import::lane::Record>,
    lane_only: HashSet<String>,
}

pub(super) fn context(
    request: &Prepare,
    pool: &rayon::ThreadPool,
) -> io::Result<(Value, Option<command_import::PreparedImport>)> {
    validate_options(request)?;
    let selection = LaneSelection::load(request)?;
    let mut context = selection.metadata(request, pool)?;
    prepare::extend_models(request, pool, &mut context, Some(&selection.imported))?;
    if selection.current.is_main() && staged_main(&request.root, &context)? {
        return Err(invalid("switch staged main components require export or reset"));
    }
    attach_versions(&mut context)?;
    selection.imported.validate()?;
    Ok((context, Some(selection.imported)))
}

fn validate_options(request: &Prepare) -> io::Result<()> {
    let options = request.options.lane.as_ref().ok_or_else(|| invalid("switch lane missing"))?;
    let checkout = request.options.to.is_some()
        || request.options.pattern.is_some()
        || request.options.message.is_some()
        || request.options.all
        || request.options.no_snap;
    let lane = !options.skip_fetch
        || options.workspace_only
        || options.include_deps
        || options.exclude_non_lane_comps
        || options.no_auto_snap;
    let merge = options.no_squash || options.squash;
    if checkout || lane || merge {
        return Err(invalid("switch requires canonical lane options"));
    }
    if options.name.contains('/') && options.name != "main" {
        return Err(invalid("switch accepts a local lane name"));
    }
    Ok(())
}

impl LaneSelection {
    fn load(request: &Prepare) -> io::Result<Self> {
        let bitmap = config::document(&request.root.join(".bitmap"))?;
        let lane_only = lane_only(&bitmap)?;
        let mut imported =
            command_import::prepare_lane(&request.root, &request.global_remotes_file)?;
        let current = super::lane_context::current_id(&bitmap, &imported.lane_scope()?)?;
        let destination = imported.resolve_lane(&request.options.lane.as_ref().unwrap().name)?;
        if current == destination {
            return Err(invalid("already checked out to requested lane"));
        }
        let lane = imported.load_lane(&destination)?;
        let current_lane = imported.load_lane(&current)?;
        validate_lane(&destination, lane.as_ref())?;
        validate_lane(&current, current_lane.as_ref())?;
        Ok(Self { imported, bitmap, current, destination, lane, current_lane, lane_only })
    }

    fn metadata(&self, request: &Prepare, pool: &rayon::ThreadPool) -> io::Result<Value> {
        let input = status_context::Request {
            root: request.root.clone(),
            home: request.home.clone(),
            history: false,
        };
        let settings = config::configuration_for_command(&request.root, true)?;
        let visible = super::lane_context::visibility::targets(&self.bitmap, &settings)?;
        let mut context = status_context::metadata_with_targets(&input, pool, &settings, visible)?;
        if self.destination.is_main() {
            context["targets"]
                .as_array_mut()
                .ok_or_else(|| invalid("switch targets"))?
                .retain(|target| {
                    !self.lane_only.contains(target["identity"].as_str().unwrap_or_default())
                });
        }
        let heads = validate_membership(&context, self)?;
        context["lane"] = json!({"currentId":self.current,"switchId":self.destination,
            "switchExported":self.lane.as_ref().is_some_and(|record| !record.is_new),
            "switchLaneOnly":self.lane_only,"switchLaneHeads":heads});
        Ok(context)
    }
}

fn validate_lane(
    id: &command_import::lane::Id,
    lane: Option<&command_import::lane::Record>,
) -> io::Result<()> {
    if !id.is_main() && lane.is_none() {
        return Err(invalid("switch local lane absent"));
    }
    if lane.is_some_and(|record| {
        record.value
            .get("forkedFrom")
            .is_some_and(|value| !value.is_null())
            || record.value["updateDependents"]
                .as_array()
                .is_some_and(|rows| !rows.is_empty())
    }) {
        return Err(invalid("switch complex lane requires canonical handling"));
    }
    Ok(())
}

fn lane_only(bitmap: &Value) -> io::Result<HashSet<String>> {
    let rows = bitmap.as_object().ok_or_else(|| invalid("switch bitmap"))?;
    rows.iter()
        .filter(|(key, row)| {
            !matches!(key.as_str(), "$schema-version" | "_bit_lane")
                && (row["isAvailableOnCurrentLane"] == false || row["onLanesOnly"] == true)
        })
        .map(|(_, row)| {
            let scope = row["scope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
                .or_else(|| row["defaultScope"].as_str())
                .ok_or_else(|| invalid("switch lane-only scope"))?;
            let name = row["name"].as_str().ok_or_else(|| invalid("switch lane-only name"))?;
            if row["onLanesOnly"] == true && row["isAvailableOnCurrentLane"] == false {
                return Err(invalid("switch inconsistent lane-only bitmap"));
            }
            Ok(format!("{scope}/{name}"))
        })
        .collect()
}

fn validate_membership(
    context: &Value,
    selection: &LaneSelection,
) -> io::Result<HashMap<String, String>> {
    let targets = context["targets"].as_array().ok_or_else(|| invalid("switch targets"))?;
    if targets.len() > 4096 {
        return Err(invalid("switch target budget"));
    }
    let lane_heads = entries(selection.lane.as_ref())?;
    let current_heads = entries(selection.current_lane.as_ref())?;
    let tracked = targets
        .iter()
        .filter_map(|target| target["identity"].as_str())
        .collect::<HashSet<_>>();
    for entry in lane_heads.iter().chain(&current_heads) {
        if entry.hidden {
            return Err(invalid("switch hidden lane component requires canonical handling"));
        }
        if !tracked.contains(entry.identity.as_str())
            && !selection.lane_only.contains(&entry.identity)
        {
            return Err(invalid(
                "switch lane component addition/removal requires canonical handling",
            ));
        }
    }
    Ok(lane_heads
        .into_iter()
        .map(|entry| (entry.identity, entry.head))
        .collect())
}

fn entries(
    record: Option<&command_import::lane::Record>,
) -> io::Result<Vec<command_import::lane::Entry>> {
    record
        .map(|record| command_import::lane::entries(&record.value))
        .transpose()
        .map(Option::unwrap_or_default)
}

fn attach_versions(context: &mut Value) -> io::Result<()> {
    let versions = context["targets"]
        .as_array()
        .ok_or_else(|| invalid("switch targets"))?
        .iter()
        .map(|target| target_version(context, target))
        .collect::<io::Result<Vec<_>>>()?;
    for (target, version) in context["targets"]
        .as_array_mut()
        .ok_or_else(|| invalid("switch targets"))?
        .iter_mut()
        .zip(versions)
    {
        target["switchVersion"] = json!(version);
    }
    Ok(())
}

fn target_version(context: &Value, target: &Value) -> io::Result<String> {
    let identity = target["identity"].as_str().ok_or_else(|| invalid("switch identity"))?;
    if let Some(head) = context["lane"]["switchLaneHeads"][identity].as_str() {
        return Ok(head.to_owned());
    }
    let model = repository::model(context, identity)?
        .ok_or_else(|| invalid("switch main component model absent"))?;
    let head = model["head"].as_str().ok_or_else(|| invalid("switch main head absent"))?;
    Ok(super::selection::versions::label(&model, head))
}

fn staged_main(root: &std::path::Path, context: &Value) -> io::Result<bool> {
    let bytes = match std::fs::read(root.join(".bit/staged-snaps")) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    let staged = std::str::from_utf8(&bytes).map_err(io::Error::other)?;
    let staged = staged
        .lines()
        .map(str::trim)
        .collect::<HashSet<_>>();
    let models = context["models"].as_array().ok_or_else(|| invalid("switch models"))?;
    Ok(models.iter().any(|model| model_staged(model, &staged)))
}

fn model_staged(model: &Value, staged: &HashSet<&str>) -> bool {
    let versions = ["versions", "orphanedVersions"]
        .into_iter()
        .filter_map(|field| model[field].as_object())
        .flat_map(serde_json::Map::values)
        .filter_map(Value::as_str);
    model["head"]
        .as_str()
        .into_iter()
        .chain(versions)
        .any(|hash| staged.contains(hash))
}

pub(super) fn import_count(
    root: &std::path::Path,
    context: &Value,
    targets: &[Value],
) -> io::Result<usize> {
    if context["lane"]["switchId"]["name"] == "main" {
        return Ok(targets.len());
    }
    let staged = match std::fs::read_to_string(root.join(".bit/staged-snaps")) {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(targets.len()),
        Err(error) => return Err(error),
    };
    let local = staged
        .lines()
        .map(str::trim)
        .collect::<HashSet<_>>();
    Ok(targets
        .iter()
        .filter(|target| {
            let identity = target["identity"].as_str().unwrap_or_default();
            let version = target["switchVersion"].as_str().unwrap_or_default();
            context["lane"]["switchLaneHeads"].get(identity).is_none() || !local.contains(version)
        })
        .count())
}

pub(super) fn append_skipped(
    context: &Value,
    targets: &[Value],
    result: &mut Value,
) -> io::Result<()> {
    if context["lane"]["switchId"]["name"] == "main" {
        return Ok(());
    }
    let lane_only = context["lane"]["switchLaneOnly"]
        .as_array()
        .ok_or_else(|| invalid("switch lane-only result"))?;
    let failed = result["failedComponents"]
        .as_array_mut()
        .ok_or_else(|| invalid("switch failure result"))?;
    for identity in lane_only.iter().filter_map(Value::as_str) {
        if targets
            .iter()
            .any(|target| target["identity"] == identity)
        {
            continue;
        }
        if let Some(head) = context["lane"]["switchLaneHeads"][identity].as_str() {
            failed.push(json!({"id":format!("{identity}@{head}"),
                "unchangedMessage":format!("component {identity} is already at version {head}"),
                "unchangedLegitimately":true}));
        }
    }
    Ok(())
}
