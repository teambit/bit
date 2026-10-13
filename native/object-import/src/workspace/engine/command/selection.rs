pub(super) mod versions;

#[cfg(test)]
mod tests;

use super::{super::invalid, input::Options, repository::Repository};
use serde_json::{Value, json};
use std::io;

pub(super) struct Selection<'a> {
    pub(super) target: &'a Value,
    pub(super) model: Option<&'a Value>,
    pub(super) modified: bool,
    pub(super) merge_pending: bool,
    pub(super) remote_head: Option<&'a str>,
    pub(super) semver: &'a Value,
}

pub(super) fn select(
    options: &Options,
    selection: &Selection<'_>,
    repository: &mut Repository,
    state: &mut crate::checkout_transition::State,
) -> io::Result<Value> {
    let mut cursor = crate::checkout_transition::apply(
        "checkoutSelectBegin",
        begin(options, selection)?,
        state,
    )?;
    let mut observed = Vec::new();
    for _ in 0..10 {
        let directive = &cursor["directive"];
        if directive["kind"] != "observe" {
            let mut result = directive.clone();
            result["observations"] = json!(observed);
            return Ok(result);
        }
        let observation = directive["observation"]
            .as_str()
            .ok_or_else(|| invalid("command checkout observation"))?;
        let value = observe(observation, directive, options, selection, repository)?;
        observed.push(observation.to_owned());
        cursor = crate::checkout_transition::apply(
            "checkoutSelectReceipt",
            json!({
                "token":cursor["token"],"revision":cursor["revision"],"observation":observation,"value":value,
            }),
            state,
        )?;
    }
    Err(invalid("command checkout selection limit"))
}

fn begin(options: &Options, selection: &Selection<'_>) -> io::Result<Value> {
    let to = options.to.as_deref().ok_or_else(|| invalid("command checkout target"))?;
    let identity = selection.target["identity"]
        .as_str()
        .ok_or_else(|| invalid("command checkout identity"))?;
    let version = selection.target["version"].as_str().unwrap_or_default();
    let ancestor = to
        .strip_prefix("head~")
        .map(str::parse::<usize>)
        .transpose()
        .map_err(io::Error::other)?;
    let exact = !matches!(to, "head" | "latest" | "reset" | "main") && ancestor.is_none();
    Ok(json!({
        "component":{"id":if version.is_empty(){identity.to_owned()}else{format!("{identity}@{version}")},
            "idWithoutVersion":identity,"componentVersion":version,"hasBitmap":true,"currentExists":true,"isRemoved":false},
        "model":selection.model.map(|model|json!({"hasMainHead":model["head"].is_string()})),
        "options":{"reset":to=="reset","head":to=="head","main":to=="main","latest":to=="latest",
            "forceOurs":options.force_ours,"forceTheirs":options.force_theirs,"revert":false,"loadStash":false,
            "ancestor":ancestor,"version":exact.then_some(to),"versionPerId":null},
    }))
}

fn observe(
    observation: &str,
    directive: &Value,
    options: &Options,
    selection: &Selection<'_>,
    repository: &mut Repository,
) -> io::Result<Value> {
    let model = selection.model.ok_or_else(|| invalid("command checkout missing model"))?;
    match observation {
        "unmerged" => Ok(json!(false)),
        "resolveTarget" => versions::resolve(options, selection, repository).map(Value::String),
        "hasVersion" => {
            versions::has(model, directive["version"].as_str().unwrap_or_default(), repository)
                .map(Value::Bool)
        }
        "currentVersion" => Ok(json!({"value":selection.target["version"],"hasBitmap":true})),
        "mergePending" => Ok(json!(selection.merge_pending)),
        "modified" => Ok(json!({"modified":selection.modified,"isRemoved":false})),
        "targetRemoved" => {
            let hash = versions::reference(
                model,
                directive["version"].as_str().ok_or_else(|| invalid("command target version"))?,
            )?;
            let removed = match repository.read(&hash, "Version") {
                Ok(version) => removed(&version)?,
                Err(error) if error.kind() == io::ErrorKind::NotFound => false,
                Err(error) => return Err(error),
            };
            Ok(json!({"removed":removed,"hasBitmap":true}))
        }
        _ => Err(invalid("command checkout unknown observation")),
    }
}

fn removed(version: &Value) -> io::Result<bool> {
    let extensions =
        version["extensions"].as_array().ok_or_else(|| invalid("command Version extensions"))?;
    Ok(extensions
        .iter()
        .any(|extension| {
            extension["name"]
                .as_str()
                .or_else(|| extension["extensionId"].as_str())
                .is_some_and(|id| id.split('@').next() == Some("teambit.component/remove"))
                && extension["config"]["removed"] == true
        }))
}
