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

pub(super) fn load(
    host: &Host,
    context: &Value,
    capture: &mut Capture,
    status: bool,
) -> io::Result<bool> {
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
    if info["onLoad"] != true && info["issues"] != true {
        return Ok(false);
    }
    let components = capture.captured.iter().map(|row| {
        let identity = text(row.get("identity"))?;
        let issues = capture.components.iter().find(|component|component.identity.split('@').next() == Some(identity)).map_or_else(||json!([]), |component|component.issues.clone());
        Ok(json!({"identity":identity,"version":row["version"],"directory":row["directory"],"files":row["files"],"current":row["current"],"issues":issues,"scope":scope_metadata(context,identity)?}))
    }).collect::<io::Result<Vec<_>>>()?;
    let directory = tempfile::Builder::new().prefix("bit-native-callback-").tempdir()?;
    let rows = host.call(
        "statusLoadCallbacks",
        &json!({"components":components,"status":status,"directory":directory.path()}),
    )?;
    capture.cache.retain_callback_directory(directory);
    capture.cache.retain_callback_stdout(rows["stdout"].as_str().unwrap_or_default());
    for row in array(rows.get("value"), "callback components")? {
        apply(capture, row)?;
    }
    Ok(info["issues"] == true)
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
    Ok(json!({"model":model,"head":version}))
}

fn apply(capture: &mut Capture, row: &Value) -> io::Result<()> {
    let identity = text(row.get("identity"))?;
    for target in capture.captured.iter_mut().chain(&mut capture.comparisons) {
        if target["identity"] == identity {
            target["current"] = row["current"].clone();
            target["files"] = row["files"].clone();
            target["sourceOverlayRoot"] = row["sourceOverlayRoot"].clone();
            target["sourceOverlays"] = row["sourceOverlays"].clone();
        }
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
    let ignored = context["workspace"]["teambit.component/issues"]
        .get("ignoreIssues")
        .cloned()
        .unwrap_or_else(|| json!([]));
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
