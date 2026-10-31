use super::super::{invalid, repository::Repository};
use serde_json::{Value, json};
use std::io;

/// Issue callbacks inspect optional model/current-lane heads even when ordinary
/// snap metadata only needs the checked-out Version. Missing objects are a
/// proven absence, not permission to omit an existing issue-bearing Version.
pub(super) fn capture(context: &Value, repository: &mut Repository) -> io::Result<Value> {
    let mut output = Vec::new();
    for model in context["models"].as_array().ok_or_else(|| invalid("resolve issue models"))? {
        let identity = model_identity(context, model)?;
        let lane_head = find_lane_head(context, &identity);
        let mut heads = Vec::new();
        for hash in [model["head"].as_str(), lane_head]
            .into_iter()
            .flatten()
            .map(str::trim)
            .filter(|hash| !hash.is_empty())
        {
            if heads
                .iter()
                .any(|head: &Value| head["hash"] == hash)
            {
                continue;
            }
            let version = match repository.read(hash, "Version") {
                Ok(version) => version,
                Err(error) if error.kind() == io::ErrorKind::NotFound => Value::Null,
                Err(error) => return Err(error),
            };
            heads.push(json!({"hash":hash,"version":version}));
        }
        output.push(json!({"identity":identity,"heads":heads}));
    }
    Ok(json!(output))
}

fn model_identity(context: &Value, model: &Value) -> io::Result<String> {
    if model["scope"]
        .as_str()
        .is_some_and(|scope| !scope.trim().is_empty())
    {
        return super::selection::identity(model);
    }
    let name = model["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty() && !name.contains('@'))
        .ok_or_else(|| invalid("resolve identity name"))?;
    if let Some(identity) = context["targets"]
        .as_array()
        .and_then(|targets| {
            targets
                .iter()
                .filter_map(|target| target["identity"].as_str().map(str::trim))
                .find(|identity| {
                    identity.split_once('/').map_or(*identity, |(_, bare)| bare.trim()) == name
                })
        })
    {
        return Ok(identity.to_owned());
    }
    if let Some(scope) = context["workspace"]["teambit.workspace/workspace"]["defaultScope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty() && !scope.contains('/'))
    {
        return Ok(format!("{scope}/{name}"));
    }
    super::selection::identity(model)
}

fn find_lane_head<'a>(context: &'a Value, identity: &str) -> Option<&'a str> {
    context["lane"]["targets"]
        .as_array()?
        .iter()
        .find(|row| row["identity"].as_str().map(str::trim) == Some(identity.trim()))?["currentHead"]
        .as_str()
}

#[cfg(test)]
mod tests;
