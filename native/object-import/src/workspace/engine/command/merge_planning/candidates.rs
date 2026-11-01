//! Implicit component merges select diverged local and remote heads.

use super::{
    super::input::{Operation, Prepare},
    Repository, history, invalid, model,
};
use serde_json::Value;
use std::io;

#[inline]
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
    let mut selected = Vec::with_capacity(targets.len());
    for target in targets {
        let identity = target_identity(&target).ok_or_else(|| invalid("command merge identity"))?;
        let Some(model) = model(context, &identity)? else {
            continue;
        };
        let local_head = model["head"]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty() && *head != "0");
        let remote = repository.remote_head(&identity)?;
        let remote_head = remote
            .as_deref()
            .map(str::trim)
            .filter(|head| !head.is_empty() && *head != "0");
        let distance = history.distance(
            &request.root,
            &identity,
            &model,
            [local_head, remote_head],
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

#[inline]
fn target_identity(target: &Value) -> Option<std::borrow::Cow<'_, str>> {
    if let Some(identity) = ["identity", "id"]
        .into_iter()
        .find_map(|field| {
            target[field]
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
    {
        let bare = identity.rsplit_once('@').map_or(identity, |(prefix, _)| prefix.trim());
        if !bare.is_empty() {
            return Some(std::borrow::Cow::Borrowed(bare));
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
        Some(scope) => Some(std::borrow::Cow::Owned(format!("{scope}/{name}"))),
        None => Some(std::borrow::Cow::Borrowed(name)),
    }
}
