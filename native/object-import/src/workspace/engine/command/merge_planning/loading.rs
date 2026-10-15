use super::{Action, Record, Selected, capture, invalid, lane_filter, model, selection};
use serde_json::Value;
use std::io;

pub(super) fn load_selected(
    record: &mut Record,
    captured: &capture::Captured,
) -> io::Result<Selected> {
    let identity = &captured.target.identity;
    let model =
        model(&record.context, identity)?.ok_or_else(|| invalid("command merge missing model"))?;
    if record.repository.read(&super::super::super::hash(identity.as_bytes()), "Component")?
        != model
    {
        return Err(invalid("command merge model changed"));
    }
    let (remote, current_head) = heads(record, identity, &model)?;
    let (current_hash, current) = if captured.added {
        (String::new(), Value::Null)
    } else {
        let hash = selection::versions::reference(&model, &captured.target.version)?;
        let version = record.repository.read(&hash, "Version")?;
        (hash, version)
    };
    let incoming = record.repository.read(&remote, "Version")?;
    Ok(Selected {
        model,
        remote,
        current_hash,
        current_head,
        versions: [Value::Null, current, incoming],
        base: String::new(),
        action: Action::Unchanged,
        distance: Value::Null,
    })
}

fn heads(record: &mut Record, identity: &str, model: &Value) -> io::Result<(String, String)> {
    let lane_target = record.context
        .get("lane")
        .and_then(|lane| lane["targets"].as_array())
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["identity"] == identity)
        });
    let remote = if let Some(target) = lane_target {
        target["head"]
            .as_str()
            .ok_or_else(|| invalid("lane incoming head"))?
            .to_owned()
    } else {
        record.repository
            .remote_head(identity)?
            .ok_or_else(|| invalid("command merge missing remote head"))?
    };
    let current_head = lane_target
        .map_or(&model["head"], |target| &target["currentHead"])
        .as_str()
        .unwrap_or_default()
        .to_owned();
    Ok((remote, current_head))
}

pub(super) fn options(
    record: &Record,
    captured: &capture::Captured,
    selected: &Selected,
) -> io::Result<super::merge::SelectionOptions> {
    let modified = !captured.added
        && crate::workspace::engine::status_models::comparison::compare(
            &captured.target,
            &captured.metadata,
            &selected.versions[1],
        )?["modified"]
            == true;
    Ok(super::merge::SelectionOptions {
        modified,
        target_as_diverged: record.request.options.lane.is_some()
            && record.request.options.no_snap,
    })
}

pub(super) fn import_gap(record: &mut Record, selected: &mut [Selected]) -> io::Result<()> {
    let gap = lane_filter::gap_targets(record.context.get("lane"), selected)?;
    record.repository.prepare_merge_gap(&gap)?;
    for selected in selected
        .iter_mut()
        .filter(|selected| selected.action != Action::Unchanged)
    {
        let identity = format!(
            "{}/{}",
            selected.model["scope"].as_str().unwrap_or_default(),
            selected.model["name"].as_str().unwrap_or_default(),
        );
        let model =
            record.repository.read(&super::super::super::hash(identity.as_bytes()), "Component")?;
        refresh_model(selected, model)?;
        if !selected.base.is_empty() {
            selected.versions[0] = record.repository.read(&selected.base, "Version")?;
        }
    }
    Ok(())
}
pub(super) fn refresh_model(selected: &mut Selected, model: Value) -> io::Result<()> {
    if selected.action == Action::Merge && model["head"] != selected.model["head"] {
        return Err(invalid("command merge local head changed during gap import"));
    }
    // Import can advance a fast-forward model, but never changes the cached target
    // selected before fetching the common snap.
    selected.model = model;
    Ok(())
}
