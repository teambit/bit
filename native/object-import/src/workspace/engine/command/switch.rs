//! Local, ordinary lane switches reuse checkout capture, transition and bitmap publication.
//! Resolve the complete target set before the command retains a writable plan.
pub(super) mod progress;
pub(super) mod validation;
pub(super) use report::append_skipped;
mod load_order;
mod report;
mod selection;
#[cfg(test)]
mod tests;
use super::{Record, capture, input::Prepare, invalid, planning, prepare, repository};
use crate::{
    command_import,
    workspace::{
        engine::{client_status::config, status_context},
        snapshots,
    },
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
    chosen: Option<Vec<String>>,
}

pub(super) fn context(
    request: &Prepare,
    pool: &rayon::ThreadPool,
) -> io::Result<(Value, Option<command_import::PreparedImport>)> {
    validation::options(request)?;
    let mut selection = LaneSelection::load(request)?;
    let mut context = selection.metadata(request, pool)?;
    prepare::extend_models(request, pool, &mut context, Some(&selection.imported))?;
    selection.remove_without_main_head(&mut context)?;
    load_order::apply(&mut context, &entries(selection.lane.as_ref())?)?;
    selection::attach(&mut context, request)?;
    if selection.current.is_main() && staged_main(&request.root, &context)? {
        return Err(invalid("switch staged main components require export or reset"));
    }
    attach_versions(&mut context)?;
    let count =
        progress::import_count(&request.root, &context, context["targets"].as_array().unwrap())?;
    context["switchImportCount"] = json!(count);
    context["switchCheckoutImport"] = progress::receipt(count);
    context["switchRemoteWarning"] = json!(selection.imported.switch_warning());
    selection.imported.validate()?;
    Ok((context, Some(selection.imported)))
}

impl LaneSelection {
    fn remove_without_main_head(&self, context: &mut Value) -> io::Result<()> {
        if !self.destination.is_main() {
            return Ok(());
        }
        let targets = context["targets"].as_array().ok_or_else(|| invalid("switch targets"))?;
        let keep = targets
            .iter()
            .map(|target| {
                let identity =
                    target["identity"].as_str().ok_or_else(|| invalid("switch identity"))?;
                Ok(!self.lane_only.contains(identity)
                    || repository::model(context, identity)?
                        .is_some_and(|model| model["head"].as_str().is_some()))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let retained: Vec<Value> = targets
            .iter()
            .zip(keep)
            .filter(|(_, keep)| *keep)
            .map(|(target, _)| target.clone())
            .collect();
        context["targets"] = json!(retained);
        Ok(())
    }

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
        refresh_main(request, &bitmap, &mut imported)?;
        let lane = imported.resolve_switch_lane(
            &destination,
            request.options.lane.as_ref().unwrap().skip_fetch,
        )?;
        if !request.options.lane.as_ref().unwrap().skip_fetch && imported.fetched_lane().is_some() {
            if !imported.lane_import_histories().is_empty() {
                return Err(invalid("switch fetched lane history requires canonical handling"));
            }
            imported.stage_switch_tracking_alias(
                &destination,
                request.options.lane
                    .as_ref()
                    .unwrap()
                    .alias
                    .as_deref(),
            )?;
        }
        let current_lane = imported.load_lane(&current)?;
        validate_lane(&destination, lane.as_ref())?;
        validate_lane(&current, current_lane.as_ref())?;
        let chosen = selection::chosen(request, &bitmap, &entries(lane.as_ref())?)
            .map_err(|error| {
                super::super::response::with_progress(error, repository::import_progress(&imported))
            })?;
        Ok(Self { imported, bitmap, current, destination, lane, current_lane, lane_only, chosen })
    }

    fn metadata(&mut self, request: &Prepare, pool: &rayon::ThreadPool) -> io::Result<Value> {
        let input = status_context::Request {
            root: request.root.clone(),
            home: request.home.clone(),
            history: false,
        };
        let settings = config::configuration_for_command(&request.root, true)?;
        let destination_heads = entries(self.lane.as_ref())?
            .into_iter()
            .map(|entry| entry.identity)
            .collect::<HashSet<_>>();
        let mut visible = super::lane_context::visibility::switch_targets(
            &self.bitmap,
            &settings,
            self.destination.is_main(),
            &destination_heads,
        )?;
        visible.retain(|target| self.allows(target["identity"].as_str().unwrap_or_default()));
        let mut context = status_context::metadata_with_targets(&input, pool, &settings, visible)?;
        let heads = validate_membership(&context, self)?;
        let (additions, added_targets, selected) =
            self.additions(&request.root, &context, &settings)?;
        context["lane"] = json!({"currentId":self.current,"switchId":self.destination,
            "switchExported":self.lane.as_ref().is_some_and(|record| !record.is_new),
            "switchFetched":self.imported.fetched_lane().is_some(),
            "switchLaneOnly":self.lane_only,"switchLaneHeads":heads,

            "additions":additions,"addedTargets":added_targets,"targets":selected});
        Ok(context)
    }

    fn allows(&self, identity: &str) -> bool {
        self.chosen
            .as_ref()
            .is_none_or(|ids| ids.iter().any(|id| id == identity))
    }

    fn additions(
        &mut self,
        root: &std::path::Path,
        context: &Value,
        settings: &Value,
    ) -> io::Result<(Vec<Value>, Vec<Value>, Vec<Value>)> {
        let tracked = context["targets"]
            .as_array()
            .ok_or_else(|| invalid("switch targets"))?
            .iter()
            .filter_map(|target| target["identity"].as_str())
            .collect::<HashSet<_>>();
        let selected = selection::ordered(entries(self.lane.as_ref())?, self.chosen.as_deref())
            .into_iter()
            .filter(|entry| {
                self.allows(&entry.identity)
                    && !tracked.contains(entry.identity.as_str())
                    && !self.lane_only.contains(&entry.identity)
            })
            .map(|entry| {
                json!({"identity":entry.identity,"head":entry.head,"visible":false,"hidden":false,
                "currentIdPresent":false,"bitmapPresent":false})
            })
            .collect::<Vec<_>>();
        let identity_bitmap =
            super::lane_context::visibility::identity_bitmap(&self.bitmap, settings)?;
        let additions = super::lane_context::additions::prepare_switch(
            &mut self.imported,
            root,
            &identity_bitmap,
            settings,
            &selected,
        )?;
        for row in &selected {
            let identity =
                row["identity"].as_str().ok_or_else(|| invalid("switch addition identity"))?;
            self.lane_only.insert(identity.to_owned());
        }
        let targets = super::lane_context::additions::targets(&additions, &selected);
        Ok((additions, targets, selected))
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
        record.value["updateDependents"]
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
    }
    for entry in &current_heads {
        if selection.chosen.is_none()
            && !tracked.contains(entry.identity.as_str())
            && !selection.lane_only.contains(&entry.identity)
        {
            return Err(invalid("switch current lane component absent from bitmap"));
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

pub(super) fn plan(
    record: &mut Record,
    current: Vec<Value>,
    semver: &Value,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<planning::Planned> {
    let mut planned = planning::checkout(record, current, semver, snapshots, pool)?;
    let additions = record.context["lane"]["additions"]
        .as_array()
        .ok_or_else(|| invalid("switch additions"))?
        .clone();
    for destination in &additions {
        let scope =
            destination["scope"].as_str().ok_or_else(|| invalid("switch addition scope"))?;
        let name = destination["name"].as_str().ok_or_else(|| invalid("switch addition name"))?;
        let head =
            destination["version"].as_str().ok_or_else(|| invalid("switch addition head"))?;
        let identity = format!("{scope}/{name}");
        planned.captured.push(capture::addition(&identity, destination)?);
        let selected = json!({"kind":"target","version":head,"merge":false});
        let index = planned.captured.len() - 1;
        planning::prepare_one(record, &mut planned, index, &selected, snapshots)?;
    }
    Ok(planned)
}

fn staged_main(root: &std::path::Path, context: &Value) -> io::Result<bool> {
    let bytes = match std::fs::read(crate::scope_path(root).join("staged-snaps")) {
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

fn refresh_main(
    request: &Prepare,
    bitmap: &Value,
    imported: &mut command_import::PreparedImport,
) -> io::Result<()> {
    if request.options.lane.as_ref().unwrap().skip_fetch {
        return Ok(());
    }
    let settings = config::configuration_for_command(&request.root, true)?;
    let visible = super::lane_context::visibility::targets(bitmap, &settings)?;
    let identities = visible
        .iter()
        .map(|target| {
            target["identity"]
                .as_str()
                .ok_or_else(|| invalid("switch main refresh identity"))
                .map(str::to_owned)
        })
        .collect::<io::Result<Vec<_>>>()?;
    imported.refresh_lane_main(&identities)?;
    imported.switch_existing_versions();
    Ok(())
}
