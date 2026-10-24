use super::{Record, capture, history, history_replay, input, repository, selection};
use crate::checkout_transition;
use serde_json::{Value, json};
use std::io;

pub(super) fn select(
    record: &mut Record,
    index: usize,
    captured: &capture::Captured,
    semver: &Value,
    histories: &mut history::State,
    state: &mut checkout_transition::State,
    recovery_reset: bool,
) -> io::Result<Value> {
    if let Some(selected) =
        super::super::lane_history::planning::added(&record.targets[index], captured)
    {
        return Ok(selected);
    }
    let identity = &captured.target.identity;
    if !super::super::checkout_stash::loading(&record.request.options)
        && let Some(selected) = tracked_head(record, captured)
    {
        return Ok(selected);
    }
    let model = repository::model(&record.context, identity)?;
    let remote = remote_head(record, identity)?;
    let (modified, pending) = super::modification(
        record,
        captured,
        model.as_ref(),
        remote.as_deref(),
        histories,
        recovery_reset,
    )?;
    let selected = selection::select(
        &record.request.options,
        &selection::Selection {
            target: &record.targets[index],
            model: model.as_ref(),
            modified,
            merge_pending: pending,
            remote_head: remote.as_deref(),
            lane_head: super::lane_head(&record.context, identity),
            semver,
        },
        &mut record.repository,
        state,
    )?;
    replay_selected(record, identity, model.as_ref(), remote.as_deref(), &selected, histories)?;
    Ok(selected)
}

fn tracked_head(record: &Record, captured: &capture::Captured) -> Option<Value> {
    let tracked = record.request.operation == input::Operation::Checkout
        && record.request.options.to.as_deref() == Some("head")
        && record.context["lane"]["trackedTargets"]
            .as_array()?
            .iter()
            .any(|row| row["identity"] == captured.target.identity);
    let head = tracked.then(|| super::lane_head(&record.context, &captured.target.identity))??;
    Some(json!({"kind":"target","version":head,"merge":false}))
}

fn remote_head(record: &mut Record, identity: &str) -> io::Result<Option<String>> {
    if super::super::lane_history::phase(&record.request.options).is_some() {
        super::super::lane_history::heads::remote(record, identity)
    } else if record.request.operation == input::Operation::Switch {
        Ok(None)
    } else {
        record.repository.remote_head(identity)
    }
}

fn replay_selected(
    record: &mut Record,
    identity: &str,
    model: Option<&Value>,
    remote: Option<&str>,
    selected: &Value,
    histories: &mut history::State,
) -> io::Result<()> {
    if record.request.operation != input::Operation::Switch
        && !super::super::checkout_stash::loading(&record.request.options)
    {
        history_replay::replay(record, identity, model, remote, selected, histories)?;
    }
    Ok(())
}
