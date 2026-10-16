use super::{Input, invalid};
use crate::js_json::Value as Js;
use serde_json::{Value, json};
use std::io;

pub(super) fn receipt(value: &Value, inputs: &[Input<'_>]) -> io::Result<()> {
    let rows = value["versions"].as_array().ok_or_else(|| invalid("command snap allocations"))?;
    if rows.len() != inputs.len() || inputs.len() > 4096 {
        return Err(invalid("command snap allocation count"));
    }
    for (row, input) in rows.iter().zip(inputs) {
        independent(input, inputs)?;
        if row["identity"] != input.identity {
            return Err(invalid("command snap allocation identity"));
        }
        crate::merge_history::hash(
            row["hash"].as_str().ok_or_else(|| invalid("command snap hash"))?,
        )?;
    }
    receipt_scalars(value)?;
    Ok(())
}
pub(super) fn version(input: &Input<'_>, receipt: &Value, message: &str) -> io::Result<Value> {
    let mut version = base_version(input, receipt, message)?;
    apply_squash(input, receipt, &mut version)?;
    apply_origin(input, &mut version)?;
    let extensions =
        version["extensions"].as_array_mut().ok_or_else(|| invalid("command snap extensions"))?;
    for extension in extensions {
        if extension["name"] == "teambit.pipelines/builder" {
            extension["data"] = json!({});
        }
    }
    Ok(version)
}

fn base_version(input: &Input<'_>, receipt: &Value, message: &str) -> io::Result<Value> {
    let mut version = current_schema(&input.material.version)?;
    if version.get("flattenedEdgesRef").is_some() {
        version
            .as_object_mut()
            .ok_or_else(|| invalid("command snap Version"))?
            .remove("flattenedEdges");
    }
    for field in ["squashed", "unrelated", "hidden", "dependenciesGraphRef"] {
        version
            .as_object_mut()
            .unwrap()
            .remove(field);
    }
    version["log"] = receipt["log"].clone();
    version["log"]["message"] = json!(message_text(input.model, input.lane, message)?);
    let parent = input.lane
        .and_then(|lane| lane["targets"].as_array())
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["identity"] == input.identity)
        })
        .map_or(&input.model["head"], |target| &target["currentHead"]);
    version["parents"] = json!([parent, input.remote]);
    version["batchId"] = receipt["batchId"].clone();
    version["bitVersion"] = receipt["bitVersion"].clone();
    version["buildStatus"] = json!(build_status(&version));
    version["modified"] = json!([]);
    Ok(version)
}

fn build_status(version: &Value) -> &'static str {
    if version["extensions"]
        .as_array()
        .is_some_and(|extensions| {
            extensions
                .iter()
                .any(|extension| {
                    extension["name"] == "teambit.component/remove"
                        && extension["config"]["removed"] == true
                })
        })
    {
        "skipped"
    } else {
        "pending"
    }
}
pub(super) fn message_text(
    model: &Value,
    lane: Option<&Value>,
    message: &str,
) -> io::Result<String> {
    Ok(if message.is_empty() {
        if let Some(lane) = lane.filter(|lane| lane["otherId"]["name"] != "main") {
            format!(
                "merge {}/{}",
                lane["otherId"]["scope"].as_str().ok_or_else(|| invalid("merge lane scope"))?,
                lane["otherId"]["name"].as_str().ok_or_else(|| invalid("merge lane name"))?,
            )
        } else {
            format!(
                "merge {}/main",
                model["scope"].as_str().ok_or_else(|| invalid("merge model scope"))?,
            )
        }
    } else {
        message.to_owned()
    })
}

fn apply_origin(input: &Input<'_>, version: &mut Value) -> io::Result<()> {
    let (scope, name) =
        input.identity.split_once('/').ok_or_else(|| invalid("merge snap identity"))?;
    version["origin"] = json!({"id":{"scope":scope,"name":name}});
    if let Some(lane) = input.lane.filter(|lane| !lane["current"].is_null()) {
        version["origin"]["lane"] = lane["currentId"].clone();
        version["origin"]["lane"]["hash"] = lane["current"]["hash"].clone();
    }
    Ok(())
}

fn apply_squash(input: &Input<'_>, receipt: &Value, version: &mut Value) -> io::Result<()> {
    let Some(lane) = input.lane.filter(|lane| lane["shouldSquash"] == true) else {
        return Ok(());
    };
    let allocation = receipt["versions"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["identity"] == input.identity)
        })
        .ok_or_else(|| invalid("lane squash allocation"))?;
    let log = allocation["squashLog"].as_object().ok_or_else(|| invalid("lane squash log"))?;
    if log
        .get("date")
        .and_then(Value::as_str)
        .is_none()
    {
        return Err(invalid("lane squash log date"));
    }
    version["squashed"] =
        json!({"previousParents":version["parents"],"laneId":squash_lane(input.model, lane)?});
    version["parents"] = json!([version["parents"][0]]);
    version["modified"] = json!([log]);
    Ok(())
}

pub(super) fn squash_lane(model: &Value, lane: &Value) -> io::Result<Value> {
    let mut id = lane["otherId"].clone();
    if id["name"] == "main" {
        id["scope"] = json!(model["scope"].as_str().ok_or_else(|| invalid("merge model scope"))?);
    }
    Ok(id)
}

pub(super) fn current_schema(value: &Value) -> io::Result<Value> {
    let mut version = crate::workspace::engine::status_models::harmony::project(value)?;
    version["schema"] = json!("2.0.0");
    Ok(version)
}
pub(super) fn snapshot_model(input: &Input<'_>, head: &str) -> io::Result<Value> {
    if input.lane.is_some_and(|lane| !lane["current"].is_null()) {
        Ok(input.model.clone())
    } else {
        model(input.model, head)
    }
}

// ModelComponent.setHead followed by markVersionAsLocal preserves existing row
// metadata, but replaces the whole state when it has no versions member.
pub(super) fn model(input: &Value, head: &str) -> io::Result<Value> {
    crate::merge_history::hash(head)?;
    let mut model = input.clone();
    if !model.is_object() {
        return Err(invalid("command local model"));
    }
    model["head"] = json!(head);
    if model["state"]["versions"].is_null() {
        model["state"] = json!({"versions":{}});
    }
    let versions = model["state"]["versions"]
        .as_object_mut()
        .ok_or_else(|| invalid("command local versions"))?;
    let row = versions
        .entry(head)
        .or_insert_with(|| json!({}));
    if row.is_null() || *row == false {
        *row = json!({});
    }
    row.as_object_mut()
        .ok_or_else(|| invalid("command local version"))?
        .insert("local".into(), json!(true));
    Ok(model)
}

pub(super) fn object(kind: &str, hash: Option<&str>, mut fields: Value) -> io::Result<Value> {
    if kind == "Version" {
        for extension in fields["extensions"]
            .as_array_mut()
            .ok_or_else(|| invalid("command snapshot extensions"))?
        {
            extension["rawConfig"] = extension["config"].clone();
            builder_artifacts(extension)?;
        }
    } else if kind == "Component" {
        fields["scopesList"] = fields["remotes"].clone();
        if fields.get("detachedHeads").is_none() {
            fields["detachedHeads"] = json!({"heads":[],"deleted":[]});
        }
    }
    Ok(json!({"type":kind,"hash":hash,"fields":convert(&fields)?}))
}
fn convert(value: &Value) -> io::Result<Js> {
    Ok(match value {
        Value::Null => Js::Null,
        Value::Bool(value) => Js::Boolean(*value),
        Value::String(value) => Js::text(value),
        Value::Number(value) => Js::Number(format!(
            "{:016x}",
            value
                .as_f64()
                .ok_or_else(|| invalid("snapshot number"))?
                .to_bits(),
        )),
        Value::Array(rows) => Js::Array(
            rows.iter()
                .map(convert)
                .collect::<io::Result<_>>()?,
        ),
        Value::Object(rows) => Js::Object(
            rows.iter()
                .map(|(key, value)| Ok((key.encode_utf16().collect(), convert(value)?)))
                .collect::<io::Result<_>>()?,
        ),
    })
}

pub(super) fn independent(input: &Input<'_>, batch: &[Input<'_>]) -> io::Result<()> {
    for field in ["dependencies", "devDependencies", "flattenedDependencies"] {
        let rows = input.material.version[field]
            .as_array()
            .ok_or_else(|| invalid("snap dependency rows"))?;
        for row in rows {
            let id = if field == "flattenedDependencies" { row } else { &row["id"] };
            let identity = format!(
                "{}/{}",
                id["scope"].as_str().unwrap_or_default(),
                id["name"].as_str().unwrap_or_default(),
            );
            if batch
                .iter()
                .any(|target| target.identity == identity)
            {
                return Err(invalid("snap dependency version cascade requires canonical pipeline"));
            }
        }
    }
    Ok(())
}

fn receipt_scalars(value: &Value) -> io::Result<()> {
    for field in ["batchId", "bitVersion"] {
        if value[field]
            .as_str()
            .is_none_or(|text| text.is_empty() || text.len() > 4096)
        {
            return Err(invalid("command snap scalar"));
        }
    }
    if !value["log"].is_object() || value["log"]["date"].as_str().is_none() {
        return Err(invalid("command snap log"));
    }
    Ok(())
}

/// Default registered application types execute plugins during canonical snapping.
pub(super) fn no_application_files(files: &[Value]) -> io::Result<()> {
    for file in files {
        let path = file["relativePath"].as_str().ok_or_else(|| invalid("snap filename"))?;
        let name = path.rsplit('/').next().unwrap_or(path);
        if [".bit-app.", ".node-app.", ".react-app."]
            .iter()
            .any(|pattern| name.contains(pattern))
        {
            return Err(invalid("snap application registration unsupported"));
        }
    }
    Ok(())
}

fn builder_artifacts(extension: &mut Value) -> io::Result<()> {
    if extension["name"] != "teambit.pipelines/builder" {
        return Ok(());
    }
    let Some(artifacts) = extension["data"].get_mut("artifacts") else { return Ok(()) };
    for artifact in artifacts.as_array_mut().ok_or_else(|| invalid("snapshot builder artifacts"))? {
        let files =
            artifact["files"].as_array().ok_or_else(|| invalid("snapshot builder files"))?;
        let refs = files
            .iter()
            .map(|file| {
                let mut reference = json!({"relativePath":file["relativePath"],"ref":file["file"]});
                if let Some(url) = file.get("url") {
                    reference["url"] = url.clone();
                }
                reference
            })
            .collect::<Vec<_>>();
        artifact["files"] = json!({"snapshotArtifactFiles":true,"refs":refs});
    }
    Ok(())
}
