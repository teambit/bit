use super::{Record, Selected, history, invalid};
use serde_json::{Value, json};
use std::io;

pub(super) fn distance(
    record: &mut Record,
    history: &mut history::State,
    selected: &Selected,
    identity: &str,
    distance: &mut Value,
) -> io::Result<()> {
    if distance["noCommon"] != true
        || record.request.options.lane
            .as_ref()
            .is_none_or(|lane| lane.resolve_unrelated.is_none())
    {
        return Ok(());
    }
    let main = selected.model["head"].as_str();
    let mut facts = json!({"hasMain":main.is_some()});
    if let Some(main) = main {
        for (key, reference) in [
            ("hasResolvedLocally", selected.current_head.as_str()),
            ("hasResolvedRemotely", selected.remote.as_str()),
        ] {
            let compared = history.distance(
                &record.request.root,
                identity,
                &selected.model,
                [Some(reference), Some(main)],
                &mut record.repository,
            )?;
            facts[key] = json!(compared["noCommon"] != true);
        }
    }
    distance["unrelatedResolution"] = facts;
    Ok(())
}

pub(super) fn prepare(
    record: &Record,
    planned: &mut super::planning::Planned,
    prepared: &mut super::Prepared,
    selected: &[Selected],
    snapshots: &crate::workspace::snapshots::State,
) -> io::Result<()> {
    for (index, selected) in selected
        .iter()
        .enumerate()
        .filter(|(_, row)| row.action == super::Action::Unrelated)
    {
        one(record, planned, prepared, selected, index, snapshots)?;
    }
    Ok(())
}

fn one(
    record: &Record,
    planned: &mut super::planning::Planned,
    prepared: &mut super::Prepared,
    selected: &Selected,
    index: usize,
    snapshots: &crate::workspace::snapshots::State,
) -> io::Result<()> {
    let lane = record.context
        .get("lane")
        .filter(|lane| !lane["current"].is_null())
        .ok_or_else(|| invalid("unrelated merge requires current lane"))?;
    let choice = &selected.distance["unrelated"];
    let relation = relation(selected, lane, choice)?;
    let theirs = choice["strategy"].as_str().map(str::trim) == Some("theirs");
    let material = if theirs {
        target(record, planned, selected, index, snapshots, relation.clone())?
    } else {
        current(&planned.captured[index], selected, relation.clone())?
    };
    let mut pending =
        super::pending::entry(&selected.model, &selected.remote, Some(lane), &material);
    pending["unrelated"] = relation.clone();
    if let Some(rows) = prepared.unmerged.as_array_mut() {
        rows.push(pending);
    }
    super::retain_snapshot(record, prepared, selected, &planned.captured[index], &material)?;
    if let Some(rows) = planned.result["components"].as_array_mut() {
        rows.push(material.output.clone());
    }
    if let Some(lane) = &mut prepared.publication.lane {
        lane.update(
            &planned.captured[index].target.identity,
            relation["headOnCurrentLane"].as_str().ok_or_else(|| invalid("unrelated lane head"))?,
            false,
        )?;
    }
    prepared.materials.push(material);
    Ok(())
}

fn relation(selected: &Selected, lane: &Value, choice: &Value) -> io::Result<Value> {
    let reference = |field: &str| -> io::Result<&str> {
        let head = match choice[field].as_str().map(str::trim) {
            Some("current") => selected.current_hash.trim(),
            Some("other") => selected.remote.trim(),
            _ => return Err(invalid("unrelated head selector")),
        };
        (!head.is_empty()).then_some(head).ok_or_else(|| invalid("unrelated head selector"))
    };
    let lane_id = match choice["lane"].as_str().map(str::trim) {
        Some("current") => {
            json!({"name":lane["current"]["value"]["name"],"scope":lane["current"]["value"]["scope"]})
        }
        Some("other") => {
            if let Some((scope, name)) = lane["otherId"]
                .as_str()
                .and_then(|raw| raw.trim().split_once('/'))
            {
                json!({"scope": scope.trim(), "name": name.trim()})
            } else {
                lane["otherId"].clone()
            }
        }
        _ => return Err(invalid("unrelated lane selector")),
    };
    Ok(
        json!({"unrelatedHead":reference("unrelatedHead")?,"unrelatedLaneId":lane_id,"headOnCurrentLane":reference("head")?}),
    )
}

fn current(
    current: &super::capture::Captured,
    selected: &Selected,
    relation: Value,
) -> io::Result<super::merge::Prepared> {
    let rows = current.files.as_array().ok_or_else(|| invalid("unrelated current files"))?;
    let files = rows.iter().map(|file| {
        let path = file["path"].as_str().ok_or_else(|| invalid("unrelated current source path"))?;
        let bytes = std::fs::metadata(path)?.len();
        Ok(json!({"relativePath":file["relativePath"],"source":{"spoolPath":path,"spoolHash":file["rawHash"],"bytes":bytes}}))
    }).collect::<io::Result<Vec<_>>>()?;
    let statuses = rows
        .iter()
        .map(|file| {
            Ok((
                file["relativePath"]
                    .as_str()
                    .ok_or_else(|| invalid("unrelated current path"))?
                    .to_owned(),
                json!("unchanged"),
            ))
        })
        .collect::<io::Result<serde_json::Map<_, _>>>()?;
    let output = json!({"id":format!("{}@{}",current.target.identity,super::selection::versions::label(&selected.model,&selected.remote)),"filesStatus":statuses});
    Ok(super::merge::Prepared::unrelated(
        current,
        selected.versions[1].clone(),
        files,
        relation,
        output,
    ))
}

fn target(
    record: &Record,
    planned: &mut super::planning::Planned,
    selected: &Selected,
    index: usize,
    snapshots: &crate::workspace::snapshots::State,
    relation: Value,
) -> io::Result<super::merge::Prepared> {
    let directory = super::scratch::Directory::create()?;
    let selection =
        json!({"version":super::selection::versions::label(&selected.model,&selected.remote)});
    let material = super::super::materialization::prepare(
        &super::super::materialization::Input {
            root: &record.request.root,
            directory: &directory.0,
            current: &planned.captured[index],
            version: &selected.versions[2],
            reference: &selected.remote,
            selection: &selection,
            base: None,
            options: &record.request.options,
        },
        &record.repository,
        &mut planned.transitions,
        snapshots,
    )?;
    let prepared = super::merge::Prepared::unrelated(
        &planned.captured[index],
        selected.versions[2].clone(),
        material.files.clone(),
        relation,
        material.output.clone(),
    );
    planned.materials.push(material);
    planned.directories.push(directory);
    Ok(prepared)
}
