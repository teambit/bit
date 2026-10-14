pub(in crate::workspace::engine) mod dependencies;

mod config;
mod graph;
mod projection;
#[cfg(test)]
mod tests;

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
}

pub(super) struct Row {
    pub(super) identity: String,
    pub(super) baseline: Baseline,
    pub(super) files: Vec<String>,
    pub(super) merged: Value,
    pub(super) projected: Value,
    pub(super) ours_conflict: bool,
    pub(super) fast_forward: bool,
    pub(super) detected: Option<Value>,
}

pub(super) struct Prepared {
    pub(super) rows: Vec<Row>,
    pub(super) config_ready: bool,
    pub(super) dependencies_ready: bool,
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
    default_node: projection::Defaults,
    #[serde(default)]
    dependency_state: Value,
}

impl Prepared {
    pub(super) fn new() -> Self {
        Self { rows: Vec::new(), config_ready: false, dependencies_ready: false, overlay: None }
    }
    pub(super) fn receipt(&self) -> Value {
        json!({"targets":self.rows.iter().map(|row| json!({"identity":row.identity,
            "directory":row.baseline.directory,"version":row.baseline.version,"files":row.files,
            "currentMetadata":row.baseline.current,"currentVersion":row.baseline.versions[1],
            "baseVersion":row.baseline.versions[0],"otherVersion":row.baseline.versions[2],"packageName":row.baseline.package_name,"fastForward":row.fast_forward})).collect::<Vec<_>>()})
    }
    pub(super) fn validate(&self, needs_snap: bool) -> io::Result<()> {
        if !self.config_ready || needs_snap && !self.dependencies_ready {
            return Err(invalid("command merge policy preparation incomplete"));
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
    prepare_components(policy, input.components, &record)?;
    let context = projected_context(policy, &record)?;
    let targets = projected_targets(policy, &context)?;
    merge.apply_policy_configs()?;
    let needs_snap = merge.needs_snap().is_some();
    let output = json!({"token":record.token,"result":planned.plan.result,
        "dependencyPreparation":if needs_snap {json!({"context":context,"targets":targets})} else {Value::Null}});
    record.repository.validate()?;
    super::proof::verify(&record.proofs)?;
    record.planned = Some(planned);
    state.record = Some(record);
    Ok((targets.len(), output))
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
    let extensions = row.baseline.loaded_extensions(component)?;
    let merged = config::merge(
        &row.identity,
        &row.baseline.versions,
        &extensions,
        workspace,
        strategy,
        &component.semver,
    )?;
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
    row.projected["extensions"] = config::apply_configs(&extensions, &row.merged)?;
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
        validate_workspace_policy(&record.context, &row.merged)?;
    }
    policy.config_ready = true;
    Ok(())
}

fn validate_workspace_policy(context: &Value, merged: &Value) -> io::Result<()> {
    let workspace_policy = &context["workspace"][projection::RESOLVER]["policy"];
    if workspace_policy
        .as_object()
        .is_some_and(|fields| {
            fields
                .values()
                .any(|field| {
                    field
                        .as_object()
                        .is_none_or(|entries| !entries.is_empty())
                })
        })
        && merged[projection::RESOLVER]["policy"]
            .as_object()
            .is_some_and(|policy| !policy.is_empty())
    {
        return Err(invalid("command workspace dependency policy update requires canonical merge"));
    }
    Ok(())
}

impl Baseline {
    fn loaded_extensions(&self, component: &Component) -> io::Result<Value> {
        projection::extensions(
            &self.versions[1]["extensions"],
            &self.current["extensions"],
            &component.dependency_state,
            &component.default_node,
            &self.package_name,
        )
    }
}
