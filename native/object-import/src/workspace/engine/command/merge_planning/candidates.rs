//! Implicit component merges select diverged local and remote heads.
use super::{
    super::input::{Operation, Prepare},
    Repository, history, invalid, model,
};
use serde_json::Value;
use std::io;

pub(in crate::workspace::engine::command) fn select_targets(
    request: &Prepare,
    context: &Value,
    targets: Vec<Value>,
    repository: &mut Repository,
    history: &mut history::State,
) -> io::Result<Vec<Value>> {
    if request.operation != Operation::Merge
        || request.options.pattern.is_some()
        || request.options.lane.is_some()
    {
        return Ok(targets);
    }
    let mut selected = Vec::new();
    for target in targets {
        let identity = target_identity(&target).ok_or_else(|| invalid("command merge identity"))?;
        let Some(model) = model(context, &identity)? else {
            continue;
        };
        let remote = repository.remote_head(&identity)?;
        let distance = history.distance(
            &request.root,
            &identity,
            &model,
            [model["head"].as_str(), remote.as_deref()],
            repository,
        )?;
        if !distance["sourceOnly"].as_array().is_some_and(Vec::is_empty)
            && !distance["targetOnly"].as_array().is_some_and(Vec::is_empty)
        {
            selected.push(target);
        }
    }
    Ok(selected)
}

fn target_identity(target: &Value) -> Option<String> {
    if let Some(identity) = target["identity"]
        .as_str()
        .or_else(|| target["id"].as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let bare = identity.rsplit_once('@').map_or(identity, |(prefix, _)| prefix.trim());
        if !bare.is_empty() {
            return Some(bare.to_owned());
        }
    }
    let object = target["id"].as_object()?;
    let name = object
        .get("name")?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    match object
        .get("scope")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(scope) => Some(format!("{scope}/{name}")),
        None => Some(name.to_owned()),
    }
}
