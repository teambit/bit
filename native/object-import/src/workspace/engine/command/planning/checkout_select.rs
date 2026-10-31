use super::{
    Record, capture, history, history_replay, input, invalid, repository, reset_comparison,
    selection,
};
use crate::{checkout_transition, workspace::engine::status_models::comparison};
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
    let (modified, pending) = modification(
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
            lane_head: lane_head(&record.context, identity),
            semver,
        },
        &mut record.repository,
        state,
    )?;
    replay_selected(record, identity, model.as_ref(), remote.as_deref(), &selected, histories)?;
    Ok(selected)
}

fn lane_head<'a>(context: &'a Value, identity: &str) -> Option<&'a str> {
    let (scope, name) = identity.split_once('/')?;
    context["lane"]["current"]["value"]["components"]
        .as_array()?
        .iter()
        .find(|row| {
            super::super::inbound::remote::file_list::row_id_parts(row)
                .is_some_and(|(row_scope, row_name)| {
                    row_name == name
                        && row_scope
                            .filter(|val| !val.is_empty())
                            .is_none_or(|val| val == scope)
                })
        })
        .and_then(|row| row["head"].as_str())
}

fn modification(
    record: &mut Record,
    captured: &capture::Captured,
    model: Option<&Value>,
    remote: Option<&str>,
    histories: &history::State,
    recovery_reset: bool,
) -> io::Result<(bool, bool)> {
    let identity = &captured.target.identity;
    if record.request.operation == input::Operation::Switch {
        return switch_modification(record, captured, model);
    }
    let mut staged = histories.clone();
    let Some(model) = model else {
        if recovery_reset && reset_comparison::incomplete(&captured.target.current) {
            return Err(invalid("reset Source comparison requires a stored component"));
        }
        return Ok((false, false));
    };
    if record.repository.read_component(identity)? != *model {
        return Err(invalid("command model changed"));
    }
    let hash = selection::versions::reference(model, &captured.target.version)?;
    let version = record.repository.read(&hash, "Version")?;
    let modified = if recovery_reset && reset_comparison::incomplete(&captured.target.current) {
        reset_comparison::prove_changed(&captured.metadata, &version)?;
        true
    } else {
        comparison::compare(&captured.target, &captured.metadata, &version)?["modified"] == true
    };
    let source = super::super::lane_history::heads::source(
        &record.request.options,
        &record.context,
        identity,
        model,
    );
    let distance = staged.distance(
        &record.request.root,
        identity,
        model,
        [source, remote],
        &mut record.repository,
    )?;
    Ok((
        modified,
        !distance["sourceOnly"].as_array().is_some_and(Vec::is_empty)
            && !distance["targetOnly"].as_array().is_some_and(Vec::is_empty),
    ))
}

fn switch_modification(
    record: &mut Record,
    captured: &capture::Captured,
    model: Option<&Value>,
) -> io::Result<(bool, bool)> {
    let model = model.ok_or_else(|| invalid("switch model missing"))?;
    let hash = selection::versions::reference(model, &captured.target.version)?;
    let version = record.repository.read(&hash, "Version")?;
    let modified =
        comparison::compare(&captured.target, &captured.metadata, &version)?["modified"] == true;
    Ok((modified, false))
}

fn tracked_head(record: &Record, captured: &capture::Captured) -> Option<Value> {
    let tracked = record.request.operation == input::Operation::Checkout
        && record.request.options.to.as_deref() == Some("head")
        && record.context["lane"]["trackedTargets"]
            .as_array()?
            .iter()
            .any(|row| row["identity"] == captured.target.identity);
    let head = tracked.then(|| lane_head(&record.context, &captured.target.identity))??;
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
