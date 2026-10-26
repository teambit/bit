//! Harmony class hydration and callback results without transporting source bodies.

use crate::{
    commands::status::{
        capture::Capture,
        js::{array, decline, text},
    },
    host::Host,
};
use serde_json::{Value, json};
use std::io;

pub(in crate::commands::status) fn load(
    host: &Host,
    context: &Value,
    capture: &mut Capture,
    status: bool,
    snapshot: bool,
    checkout: bool,
) -> io::Result<bool> {
    let info = callback_info(host, context, capture)?;
    if !snapshot && info["onLoad"] != true && info["issues"] != true && info["classLoad"] != true {
        return Ok(false);
    }
    let components = component_rows(capture, context)?;
    let directory = tempfile::Builder::new().prefix("bit-native-callback-").tempdir()?;
    let rows = host.call(
        "statusLoadCallbacks",
        &json!({"components":components,"status":status,"snapshot":snapshot,"checkout":checkout,"configured":info["onLoad"] == true || info["classLoad"] == true,"loadOrder":context["switchStatusLoadOrder"],"directory":directory.path()}),
    )?;
    if checkout {
        checked_cache(host, capture)?;
    }
    capture.cache.retain_callback_directory(directory);
    capture.cache.retain_callback_stdout(rows["stdout"].as_str().unwrap_or_default());
    if snapshot {
        capture.environment_facts["snapshotLoadOutput"] =
            rows["value"][0]["snapshotLoadOutput"].clone();
    }
    for row in array(rows.get("value"), "callback components")? {
        apply(capture, row)?;
    }
    Ok(info["issues"] == true)
}

fn callback_info(host: &Host, context: &Value, capture: &Capture) -> io::Result<Value> {
    capture.cache.retain_callback_startup(&host.take_stdout());
    let core = core_ids()?;
    let aspects = context["workspace"]
        .as_object()
        .into_iter()
        .flat_map(|config| config.keys())
        .filter(|id| id.contains('/') && !core.contains(id))
        .collect::<Vec<_>>();
    let info = host.call("statusCallbackInfo", &json!({"coreIds":core,"aspectIds":aspects}))?;
    capture.cache.retain_callback_startup(&host.take_stdout());
    Ok(info)
}

fn checked_cache(host: &Host, capture: &mut Capture) -> io::Result<()> {
    let checked = host.call("statusDependencyCacheChecked", &json!({}))?;
    if !checked.is_boolean() {
        return Err(decline("checkout dependency loader cache receipt"));
    }
    capture.environment_facts["checkoutLoaderCacheChecked"] = checked;
    Ok(())
}

pub(in crate::commands::status) struct SwitchStage {
    directory: tempfile::TempDir,
    pub(super) issues: bool,
}

pub(super) fn switch_begin(
    host: &Host,
    context: &Value,
    capture: &Capture,
    order: &[String],
) -> io::Result<Option<SwitchStage>> {
    let info = callback_info(host, context, capture)?;
    if info["onLoad"] != true && info["classLoad"] != true {
        return Ok(None);
    }
    let directory = tempfile::Builder::new().prefix("bit-native-callback-").tempdir()?;
    let result =
        host.call("switchStatusBegin", &json!({"loadOrder":order,"directory":directory.path()}))?;
    capture.cache.retain_callback_startup(&host.take_stdout());
    if result != true {
        return Err(decline("switch callback stage begin receipt"));
    }
    Ok(Some(SwitchStage { directory, issues: info["issues"] == true }))
}

fn switch_component(context: &Value, capture: &Capture, identity: &str) -> io::Result<Value> {
    component_rows(capture, context)?
        .into_iter()
        .find(|row| row["identity"] == identity)
        .ok_or_else(|| decline("switch callback target missing"))
}

pub(super) fn switch_one(
    host: &Host,
    context: &Value,
    capture: &Capture,
    identity: &str,
) -> io::Result<Value> {
    let component = switch_component(context, capture, identity)?;
    let result = host.call("switchStatusLoadOne", &json!({"component":component}))?;
    capture.cache.retain_callback_stdout(&host.take_stdout());
    Ok(result)
}

pub(super) fn switch_stage_row(
    host: &Host,
    context: &Value,
    capture: &Capture,
    identity: &str,
) -> io::Result<()> {
    let component = switch_component(context, capture, identity)?;
    let result = host.call("switchStatusStageRow", &json!({"component":component}))?;
    capture.cache.retain_callback_stdout(&host.take_stdout());
    if result != true {
        return Err(decline("switch callback staged row receipt"));
    }
    Ok(())
}

pub(super) fn switch_resume(host: &Host, capture: &Capture) -> io::Result<Value> {
    let result = host.call("switchStatusResume", &json!({}))?;
    capture.cache.retain_callback_stdout(&host.take_stdout());
    Ok(result)
}

pub(super) fn switch_accept(
    capture: &mut Capture,
    result: &Value,
    identity: &str,
) -> io::Result<()> {
    let row = result.get("row").ok_or_else(|| decline("switch callback row receipt"))?;
    if row["identity"] != identity {
        return Err(decline("switch callback target changed"));
    }
    apply(capture, row)
}

pub(super) fn switch_finish(
    host: &Host,
    capture: &mut Capture,
    stage: SwitchStage,
) -> io::Result<bool> {
    let result = host.call("switchStatusFinish", &json!({}))?;
    capture.cache.retain_callback_stdout(&host.take_stdout());
    if result != true {
        return Err(decline("switch callback stage finish receipt"));
    }
    checked_cache(host, capture)?;
    capture.cache.retain_callback_directory(stage.directory);
    Ok(stage.issues)
}

pub(in crate::commands) fn component_rows(
    capture: &Capture,
    context: &Value,
) -> io::Result<Vec<Value>> {
    capture.captured.iter().map(|row| {
        let identity = text(row.get("identity"))?;
        let issues = capture.components.iter().find(|component|component.identity.split('@').next() == Some(identity)).map_or_else(||json!([]), |component|component.issues.clone());
        let mut result=json!({"identity":identity,"version":row["version"],"directory":row["directory"],"files":row["files"],"current":row["current"],"issues":issues,"scoped":array(context.get("targets"),"callback targets")?.iter().find(|target|target["identity"]==identity).map(|target|target["scoped"].clone()),"scope":scope_metadata(context,identity)?,"dependencyCacheMiss":capture.environment_facts["checkoutCacheMisses"][identity]});
        if let Some(version)=row.get("trackingVersion"){result["trackingVersion"]=version.clone();}
        let state = capture.dependency_states.get(identity).ok_or_else(|| decline("callback dependency state"))?;
        result["peerDependencies"] = super::super::policy::peer_metadata(state)?;
        Ok(result)
    }).collect()
}

fn scope_metadata(context: &Value, identity: &str) -> io::Result<Value> {
    let model = array(context.get("models"), "callback models")?
        .iter()
        .find(|model| {
            format!(
                "{}/{}",
                model["scope"].as_str().unwrap_or_default(),
                model["name"].as_str().unwrap_or_default(),
            ) == identity
        });
    let Some(model) = model else {
        return Ok(Value::Null);
    };
    let head = context["laneHeads"]
        .get(identity)
        .unwrap_or_else(|| &model["head"]);
    let version = array(context.get("versions"), "callback versions")?
        .iter()
        .find(|row| &row[0] == head);
    let current = current_version(context, model, identity)?;
    Ok(json!({"model":model,"head":version,"currentVersion":current}))
}

fn current_version(context: &Value, model: &Value, identity: &str) -> io::Result<Option<Value>> {
    let selected = context["targets"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["identity"] == identity)
        })
        .and_then(|row| row["version"].as_str());
    let reference = selected.and_then(|selected| {
        model["versions"]
            .get(selected)
            .and_then(Value::as_str)
            .or(Some(selected))
    });
    let current = array(context.get("versions"), "callback versions")?
        .iter()
        .find(|row| row[0].as_str() == reference)
        .map(|row| row[1].clone());
    Ok(current)
}

pub(in crate::commands::status) fn apply(capture: &mut Capture, row: &Value) -> io::Result<()> {
    let identity = text(row.get("identity"))?;
    for target in capture.captured.iter_mut().chain(&mut capture.comparisons) {
        if target["identity"] == identity {
            target["current"] = row["current"].clone();
            target["files"] = row["files"].clone();
            target["sourceOverlayRoot"] = row["sourceOverlayRoot"].clone();
            target["sourceOverlays"] = row["sourceOverlays"].clone();
        }
    }
    if let Some(data) = row.get("snapshotData") {
        capture.cache.retain_snapshot_data(identity, data.clone());
    }
    let component = capture.components
        .iter_mut()
        .find(|component| component.identity.split('@').next() == Some(identity))
        .ok_or_else(|| decline("callback component identity"))?;
    dependencies(component, row)?;
    let issues = array(row.get("issues"), "callback issues")?;
    component.issues = json!(
        issues
            .iter()
            .map(|issue| json!({"callbackObject":issue}))
            .collect::<Vec<_>>()
    );
    capture.cache.retain_callback_proofs(array(row.get("readSet"), "callback source proofs")?);
    Ok(())
}

fn dependencies(
    component: &mut crate::commands::status::issues::Component,
    row: &Value,
) -> io::Result<()> {
    let original =
        array(row.get("originalDependencyIdentities"), "callback original dependencies")?;
    component.dependencies.retain(|id| {
        !original
            .iter()
            .any(|value| value.as_str() == Some(id))
    });
    for id in array(row.get("dependencyIdentities"), "callback dependency identities")? {
        let id = text(Some(id))?.to_owned();
        if !component.dependencies.contains(&id) {
            component.dependencies.push(id);
        }
    }
    Ok(())
}

pub(in crate::commands::status) fn issue_callbacks(
    host: &Host,
    rows: &[Value],
    context: &Value,
) -> io::Result<(Vec<Value>, String)> {
    let mut ignored = context["workspace"]["teambit.component/issues"]
        .get("ignoreIssues")
        .cloned()
        .unwrap_or_else(|| json!([]));
    if let Some(extra) = context["snapshotIgnoreIssues"].as_array() {
        let mut combined = extra.clone();
        for issue in ignored.as_array().into_iter().flatten() {
            if !combined.contains(issue) {
                combined.push(issue.clone());
            }
        }
        ignored = json!(combined);
    }
    let output = host.call(
        "statusIssueCallbacks",
        &json!({"rows":rows,"coreIds":core_ids()?,"ignored":ignored}),
    )?;
    Ok((
        array(output.get("value"), "callback issue results")?.to_vec(),
        output["stdout"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
    ))
}

fn core_ids() -> io::Result<Vec<String>> {
    serde_json::from_str(include_str!(
        "../../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))
    .map_err(io::Error::other)
}
