pub(super) use hidden::prepare_hidden_metadata;
mod hidden;
#[cfg(test)]
mod tests;

use super::{Action, Record, Selected, invalid, planning};
use serde_json::{Value, json};
use std::io;

pub(super) fn validate_captures(record: &Record, planned: &planning::Planned) -> io::Result<()> {
    if record.request.options.lane.is_none() {
        return Ok(());
    }
    let targets = record.context["lane"]["targets"]
        .as_array()
        .ok_or_else(|| invalid("lane selected targets"))?;
    for target in targets {
        if !planned.captured
            .iter()
            .any(|captured| target["identity"] == captured.target.identity)
        {
            return Err(invalid("lane target requires native non-workspace capture"));
        }
    }
    Ok(())
}

pub(super) fn apply(
    record: &mut Record,
    planned: &mut planning::Planned,
    selected: &mut Vec<Selected>,
    pattern: Option<&[String]>,
) -> io::Result<()> {
    if record.request.options.lane.is_none() {
        if pattern.is_some() {
            return Err(invalid("unexpected lane pattern receipt"));
        }
        return Ok(());
    }
    let statuses = selected
        .iter()
        .zip(&planned.captured)
        .map(|(row, captured)| {
            json!({
                "identity":captured.target.identity,"targetHead":row.remote,
                "unchanged":row.action == Action::Unchanged,"distance":row.distance,
            })
        })
        .collect::<Vec<_>>();
    let filtered = super::super::lane_selection::filter(
        &record.request,
        &record.context,
        &statuses,
        pattern,
        &mut record.repository,
        &mut planned.history,
    )?;
    update_failed(planned, selected, &filtered)?;
    reorder(planned, selected, filtered.indices)
}
fn update_failed(
    planned: &mut planning::Planned,
    selected: &mut [Selected],
    filtered: &super::super::lane_selection::Filtered,
) -> io::Result<()> {
    let previous = std::mem::take(
        planned.result["failedComponents"]
            .as_array_mut()
            .ok_or_else(|| invalid("lane failed statuses"))?,
    );
    let mut failed = Vec::new();
    for index in &filtered.indices {
        let id =
            format!("{}@{}", planned.captured[*index].target.identity, selected[*index].remote);
        if let Some(excluded) = filtered.excluded
            .iter()
            .find(|row| row["index"].as_u64() == Some(*index as u64))
        {
            selected[*index].action = Action::Unchanged;
            failed.push(json!({"id":id,"unchangedMessage":excluded["message"],"unchangedLegitimately":true}));
        } else if let Some(row) = previous
            .iter()
            .find(|row| row["id"] == id)
        {
            failed.push(row.clone());
        }
    }
    planned.result["failedComponents"] = Value::Array(failed);
    Ok(())
}
fn reorder(
    planned: &mut planning::Planned,
    selected: &mut Vec<Selected>,
    indices: Vec<usize>,
) -> io::Result<()> {
    let mut rows = std::mem::take(selected)
        .into_iter()
        .map(Some)
        .collect::<Vec<_>>();
    let mut captures = std::mem::take(&mut planned.captured)
        .into_iter()
        .map(Some)
        .collect::<Vec<_>>();
    for index in indices {
        selected.push(rows[index].take().ok_or_else(|| invalid("lane duplicate selection index"))?);
        planned.captured.push(
            captures[index].take().ok_or_else(|| invalid("lane duplicate capture index"))?,
        );
    }
    Ok(())
}

pub(super) fn capture_hidden(
    record: &mut Record,
    planned: &mut planning::Planned,
    snapshots: &mut crate::workspace::snapshots::State,
) -> io::Result<()> {
    let Some(targets) = record.context["lane"]["targets"].as_array().cloned() else {
        return Ok(());
    };
    let directory = super::scratch::Directory::create()?;
    for target in targets
        .iter()
        .filter(|target| target["hidden"] == true && target["visible"] != true)
    {
        let identity = target["identity"]
            .as_str()
            .map(str::trim)
            .filter(|identity| !identity.is_empty())
            .ok_or_else(|| invalid("hidden lane identity"))?;
        if planned.captured
            .iter()
            .any(|captured| captured.target.identity == identity)
        {
            continue;
        }
        let head = target["currentHead"]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
            .ok_or_else(|| invalid("hidden lane current head"))?;
        let version = record.repository.read(head, "Version")?;
        planned.captured.push(super::capture::from_model(
            &directory.0,
            identity,
            head,
            &version,
            &mut record.repository,
            snapshots,
        )?);
    }
    planned.directories.push(directory);
    Ok(())
}

pub(super) fn capture_additions(
    record: &mut Record,
    planned: &mut planning::Planned,
    snapshots: &mut crate::workspace::snapshots::State,
) -> io::Result<()> {
    let Some(additions) = record.context["lane"]["additions"].as_array().cloned() else {
        return Ok(());
    };
    let private = super::scratch::Directory::create()?;
    for destination in &additions {
        let identity = format!(
            "{}/{}",
            destination["scope"]
                .as_str()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
                .ok_or_else(|| invalid("lane addition scope"))?,
            destination["name"]
                .as_str()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .ok_or_else(|| invalid("lane addition name"))?,
        );
        if planned.captured
            .iter()
            .any(|captured| captured.target.identity == identity)
        {
            continue;
        }
        let captured = addition(record, &identity, destination, &private.0, snapshots)?;
        planned.captured.push(captured);
    }
    planned.directories.push(private);
    Ok(())
}

fn addition(
    record: &mut Record,
    identity: &str,
    destination: &Value,
    private: &std::path::Path,
    snapshots: &mut crate::workspace::snapshots::State,
) -> io::Result<super::capture::Captured> {
    let target = record.context["lane"]["targets"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["identity"].as_str().map(str::trim) == Some(identity))
        })
        .ok_or_else(|| invalid("lane addition target"))?;
    if target["currentIdPresent"] == false {
        super::capture::addition(identity, destination)
    } else {
        let head = target["currentHead"]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
            .ok_or_else(|| invalid("lane inactive current head"))?;
        let version = record.repository.read(head, "Version")?;
        let mut captured = super::capture::from_model(
            private,
            identity,
            head,
            &version,
            &mut record.repository,
            snapshots,
        )?;
        captured.hidden = false;
        destination["rootDir"]
            .as_str()
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .ok_or_else(|| invalid("lane inactive destination"))?
            .clone_into(&mut captured.target.directory);
        Ok(captured)
    }
}

pub(super) fn gap_targets(
    lane: Option<&Value>,
    selected: &[Selected],
) -> io::Result<Vec<crate::command_import::Target>> {
    let include_history = lane.is_some_and(|lane| {
        let other_scope = lane["otherId"]
            .as_str()
            .and_then(|raw| raw.split_once('/').map(|(scope, _)| scope))
            .or_else(|| lane["otherId"]["scope"].as_str());
        lane["shouldSquash"] != true
            && !lane["other"].is_null()
            && other_scope != lane["current"]["value"]["scope"].as_str()
    });
    let mut targets = Vec::new();
    for row in selected
        .iter()
        .filter(|row| row.distance["importGap"] == true)
    {
        let versions = gap_versions(row, include_history)?;
        for version in versions {
            targets.push(crate::command_import::Target {
                scope: row.model["scope"].as_str().map(str::to_owned),
                name: row.model["name"]
                    .as_str()
                    .ok_or_else(|| invalid("lane gap name"))?
                    .to_owned(),
                version,
            });
        }
    }
    Ok(targets)
}

fn gap_versions(row: &Selected, include_history: bool) -> io::Result<Vec<String>> {
    let mut versions = Vec::new();
    if !row.base.is_empty() {
        versions.push(row.base.clone());
    }
    if include_history {
        for hash in row.distance["targetOnly"]
            .as_array()
            .ok_or_else(|| invalid("lane gap target history"))?
        {
            versions.push(
                hash.as_str()
                    .ok_or_else(|| invalid("lane gap reference"))?
                    .to_owned(),
            );
        }
    }
    Ok(versions)
}

pub(super) fn scope_only(record: &Record, current: &super::capture::Captured) -> bool {
    current.hidden
        || !record.targets
            .iter()
            .any(|target| target["identity"] == current.target.identity)
}
