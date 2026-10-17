pub(in crate::workspace::engine) mod dependencies;
pub(super) mod graph;
pub(super) mod projection;

mod config;
mod conflicts;
mod scope;
#[cfg(test)]
mod tests;
mod workspace;

use super::{Record, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

pub(super) struct Baseline {
    pub(super) directory: String,
    pub(super) version: String,
    pub(super) current: Value,
    pub(super) versions: [Value; 3],
    pub(super) package_name: String,
    pub(super) scope_only: bool,
}

pub(super) struct Row {
    pub(super) identity: String,
    pub(super) baseline: Baseline,
    pub(super) files: Vec<String>,
    pub(super) merged: Value,
    pub(super) projected: Value,
    pub(super) ours_conflict: bool,
    pub(super) fast_forward: bool,
    pub(super) receipts: Receipts,
}

#[derive(Default)]
pub(super) struct Receipts {
    pub(super) dependencies: Option<Value>,
    pub(super) configuration: Value,
}

pub(super) struct Prepared {
    pub(super) rows: Vec<Row>,
    pub(super) config_ready: bool,
    pub(super) dependencies_ready: bool,
    conflicts: Option<conflicts::File>,
    pub(super) overlay: Option<super::super::source_overlay::SourceOverlay>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Prepare {
    token: String,
    components: Vec<Component>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Component {
    identity: String,
    semver: Value,
    default_node: Option<projection::Defaults>,
    #[serde(default)]
    dependency_state: Value,
}

impl Prepared {
    pub(super) fn new() -> Self {
        Self {
            rows: Vec::new(),
            config_ready: false,
            dependencies_ready: false,
            conflicts: None,
            overlay: None,
        }
    }
    pub(super) fn receipt(&self) -> Value {
        json!({"targets":self.rows.iter().map(|row| json!({"identity":row.identity,
            "directory":row.baseline.directory,"version":row.baseline.version,"files":row.files,
            "currentMetadata":row.baseline.current,"currentVersion":row.baseline.versions[1],
            "baseVersion":row.baseline.versions[0],"otherVersion":row.baseline.versions[2],"packageName":row.baseline.package_name,"fastForward":row.fast_forward,"scopeOnly":row.baseline.scope_only})).collect::<Vec<_>>()})
    }
    pub(super) fn validate(&self, needs_snap: bool) -> io::Result<()> {
        if !self.config_ready || needs_snap && !self.dependencies_ready {
            return Err(invalid("command merge policy preparation incomplete"));
        }
        if let Some(file) = &self.conflicts {
            file.validate()?;
        }
        Ok(())
    }
    pub(super) fn commit_configs(&self) -> io::Result<()> {
        if let Some(file) = &self.conflicts {
            file.commit()?;
        }
        Ok(())
    }
}

pub(in crate::workspace::engine) fn prepare(
    input: Prepare,
    state: &mut super::State,
) -> io::Result<(usize, Value)> {
    let mut record = state.record.take().ok_or_else(|| invalid("command policy owner absent"))?;
    if record.token != input.token {
        return Err(invalid("command policy token"));
    }
    let mut planned = record.planned.take().ok_or_else(|| invalid("command policy plan absent"))?;
    let merge = planned.plan.merge.as_mut().ok_or_else(|| invalid("command policy nonmerge"))?;
    let policy =
        merge.policy.as_mut().ok_or_else(|| invalid("command policy preparation absent"))?;
    let Preparation {
        workspace,
        conflicts,
        context,
        targets,
    } = prepare_projection(policy, input.components, &record)?;
    planned.reset_config = Some(super::reset_config::merge(&record, &policy.rows)?);
    merge.apply_policy_configs()?;
    if !conflicts.is_empty() {
        merge.cancel_snap();
        planned.plan.result["configMergeResults"] = json!(conflicts);
    }
    let needs_snap = merge.needs_snap().is_some() && !targets.is_empty();
    if let Some((publication, report)) = workspace {
        planned.checkout_policy = Some(publication);
        planned.plan.result["workspaceConfigUpdateResult"] = report;
    }
    let output = json!({"token":record.token,"result":planned.plan.result,
        "dependencyPreparation":if needs_snap {json!({"context":context,"targets":targets})} else {Value::Null}});
    validate_preparation(&record, &mut planned)?;
    record.planned = Some(planned);
    state.record = Some(record);
    Ok((targets.len(), output))
}

fn validate_preparation(record: &Record, prepared: &mut super::PreparedPlan) -> io::Result<()> {
    record.repository.validate()?;
    super::proof::verify(&record.proofs)?;
    if record.request.internal_snapshot_preview {
        super::planning::validate_sources(&prepared.plan)?;
        prepared.plan.merge
            .as_mut()
            .and_then(|merge| merge.policy.as_mut())
            .ok_or_else(|| invalid("command merge policy preparation absent"))?
            .dependencies_ready = true;
    }
    Ok(())
}

struct Preparation {
    workspace: Option<(super::checkout_policy::Prepared, Value)>,
    conflicts: Vec<Value>,
    context: Value,
    targets: Vec<Value>,
}

fn prepare_projection(
    policy: &mut Prepared,
    components: Vec<Component>,
    record: &Record,
) -> io::Result<Preparation> {
    let semver =
        components.first().map_or(Value::Null, |component| component.semver.clone());
    prepare_components(policy, components, record)?;
    let workspace = workspace::prepare(policy, record, &semver)?;
    let conflicts = conflicts::prepare(policy, &record.request.root)?;
    // The retained snapshot owner detects dependencies from the materialized tree
    // after installation. Inline previews are not consumed by that lifecycle.
    if record.request.internal_snapshot_preview {
        return Ok(Preparation { workspace, conflicts, context: Value::Null, targets: Vec::new() });
    }
    let context = projected_context(policy, record)?;
    let targets = projected_targets(policy, &context)?;
    if targets.is_empty() {
        policy.dependencies_ready = true;
    }
    Ok(Preparation { workspace, conflicts, context, targets })
}

fn prepare_row(
    row: &mut Row,
    component: &Component,
    workspace: &Value,
    strategy: Option<&str>,
) -> io::Result<()> {
    if row.fast_forward {
        row.projected = row.baseline.versions[2].clone();
        return Ok(());
    }
    let extensions = if row.baseline.scope_only {
        row.baseline.current["extensions"].clone()
    } else {
        row.baseline.loaded_extensions(component)?
    };
    let (merged, configuration) = config::merge(
        &row.identity,
        &row.baseline.versions,
        &extensions,
        workspace,
        strategy,
        &component.semver,
        &row.receipts.configuration["labels"],
    )?;
    row.receipts.configuration = configuration;
    row.merged = if row.ours_conflict { json!({}) } else { merged };
    row.projected = row.baseline.versions[1].clone();
    for field in [
        "mainFile",
        "dependencies",
        "devDependencies",
        "packageDependencies",
        "devPackageDependencies",
        "peerPackageDependencies",
        "bindingPrefix",
        "overrides",
    ] {
        row.projected[field] = row.baseline.current[field].clone();
    }
    row.projected["extensions"] = scope::apply(&extensions, &row.merged, &row.baseline.versions)?;
    Ok(())
}

fn workspace_ids(record: &Record) -> io::Result<Value> {
    projection::array(&record.context["targets"])?
        .iter()
        .map(|target| {
            let identity =
                target["identity"].as_str().ok_or_else(|| invalid("command workspace identity"))?;
            Ok(json!({"base":identity,"legacy":identity,"version":target["version"]}))
        })
        .collect::<io::Result<Vec<_>>>()
        .map(Value::Array)
}

fn projected_context(policy: &Prepared, record: &Record) -> io::Result<Value> {
    let mut context = record.context.clone();
    activate_inactive(policy, &mut context)?;
    for target in
        context["targets"].as_array_mut().ok_or_else(|| invalid("command context targets"))?
    {
        if let Some(row) = policy.rows
            .iter()
            .find(|row| row.fast_forward && target["identity"] == row.identity)
        {
            target["version"] = json!(row.baseline.version);
        }
    }
    Ok(context)
}

pub(super) fn workspace_count(context: &Value, policy: Option<&Prepared>) -> io::Result<usize> {
    let mut context = context.clone();
    if let Some(policy) = policy {
        activate_inactive(policy, &mut context)?;
    }
    Ok(projection::array(&context["targets"])?.len())
}

fn activate_inactive(policy: &Prepared, context: &mut Value) -> io::Result<()> {
    let inactive = ["inactiveTargets", "addedTargets"]
        .into_iter()
        .flat_map(|key| {
            context["lane"][key]
                .as_array()
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let targets =
        context["targets"].as_array_mut().ok_or_else(|| invalid("command context targets"))?;
    for target in inactive {
        if policy.rows
            .iter()
            .any(|row| row.identity == target["identity"] && !row.ours_conflict)
            && !targets
                .iter()
                .any(|current| current["identity"] == target["identity"])
        {
            targets.push(target);
        }
    }
    Ok(())
}

fn projected_targets(policy: &Prepared, context: &Value) -> io::Result<Vec<Value>> {
    policy.rows
        .iter()
        .filter(|row| !row.baseline.scope_only)
        .map(|row| {
            let mut target = projection::array(&context["targets"])?
                .iter()
                .find(|target| target["identity"] == row.identity)
                .cloned()
                .ok_or_else(|| invalid("command policy target"))?;
            target["files"] = json!(row.files);
            target["projectedVersion"] = row.projected.clone();
            target["mergedConfig"] = row.merged.clone();
            target["autoDetectMergePolicy"] = config::automatic(&row.merged)?;
            target["mergedConfigNames"] = json!(
                row.merged
                    .as_object()
                    .ok_or_else(|| invalid("command merged config"))?
                    .keys()
                    .collect::<Vec<_>>()
            );
            Ok(target)
        })
        .collect()
}

pub(super) fn package_name(identity: &str, prefix: &str) -> String {
    let mut name = identity.replace('/', ".");
    let owner = format!("{}.", prefix.trim_start_matches('@'));
    if prefix != "@bit" && name.starts_with(&owner) {
        name = name[owner.len()..].to_owned();
    }
    format!("{prefix}/{name}")
}

fn prepare_components(
    policy: &mut Prepared,
    components: Vec<Component>,
    record: &Record,
) -> io::Result<()> {
    if policy.config_ready || components.len() != policy.rows.len() {
        return Err(invalid("command policy preparation count or phase"));
    }
    let workspace = workspace_ids(record)?;
    for (row, component) in policy.rows.iter_mut().zip(components) {
        if row.identity != component.identity {
            return Err(invalid("command policy identity"));
        }
        prepare_row(row, &component, &workspace, record.request.options.strategy.as_deref())?;
    }
    policy.config_ready = true;
    Ok(())
}

impl Baseline {
    fn loaded_extensions(&self, component: &Component) -> io::Result<Value> {
        projection::extensions(
            &self.versions[1]["extensions"],
            &self.current["extensions"],
            &component.dependency_state,
            component.default_node
                .as_ref()
                .ok_or_else(|| invalid("command workspace environment defaults"))?,
            &self.package_name,
        )
    }
}
