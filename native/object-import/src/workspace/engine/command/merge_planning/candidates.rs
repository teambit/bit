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
        let identity =
            target["identity"].as_str().ok_or_else(|| invalid("command merge identity"))?;
        let Some(model) = model(context, identity)? else {
            continue;
        };
        let remote = repository.remote_head(identity)?;
        let distance = history.distance(
            &request.root,
            identity,
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
