use super::{
    Plan, PreparedPlan, Record, bitmap, input, invalid, materialization, merge_planning, planning,
    proof,
};
use serde_json::{Value, json};
use std::io;
pub(super) fn run(
    input: Plan,
    snapshots: &mut crate::workspace::snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let mut record =
        snapshots.command.record.take().ok_or_else(|| invalid("command owner absent"))?;
    if record.token != input.token || record.planned.is_some() {
        return Err(invalid("command plan token"));
    }
    proof::verify(&input.dependency_read_set)?;
    record.proofs.extend(input.dependency_read_set);
    validate_versions(&mut record)?;
    let mut planned = pool.install(|| match record.request.operation {
        input::Operation::Checkout => {
            planning::checkout(&mut record, input.current, &input.semver, snapshots, pool)
        }
        input::Operation::Merge => merge_planning::plan(
            &mut record,
            input.current,
            input.lane_pattern_ids.as_deref(),
            snapshots,
            pool,
        ),
        input::Operation::Switch => {
            super::switch::plan(&mut record, input.current, &input.semver, snapshots, pool)
        }
    })?;
    if record.request.operation == input::Operation::Switch {
        super::switch::append_skipped(&record.context, &record.targets, &mut planned.result)?;
    }
    let bitmap = prepare_bitmap(&record, &planned)?;
    for material in &planned.materials {
        materialization::validate(material, &record.request.root)?;
    }
    record.repository.validate()?;
    proof::verify(&record.proofs)?;
    let output = plan_output(&record, &planned)?;
    let count = planned.result["components"].as_array().map_or(0, Vec::len);
    record.planned =
        Some(PreparedPlan { plan: planned, bitmap, snap_bitmap: None, reset_config: None });
    snapshots.command.record = Some(record);
    Ok((count, output))
}

fn plan_output(record: &Record, planned: &planning::Planned) -> io::Result<Value> {
    let mut output = json!({"token":record.token,"result":planned.result,"progress":record.repository.progress()});
    if record.request.operation == input::Operation::Switch {
        output["switchImportCount"] = json!(super::switch::progress::import_count(
            &record.request.root,
            &record.context,
            &record.targets
        )?);
    }
    snap_receipt(&mut output, planned)?;
    if let Some(receipt) = planned.merge.as_ref().and_then(merge_planning::Prepared::lane_receipt) {
        output["lanePreparation"] = receipt;
    }
    Ok(output)
}

fn snap_receipt(output: &mut Value, planned: &planning::Planned) -> io::Result<()> {
    if let Some(policy) = planned.merge.as_ref().and_then(|merge| merge.policy.as_ref()) {
        output["policyPreparation"] = policy.receipt();
        return Ok(());
    }
    if let Some(identities) = planned.merge.as_ref().and_then(merge_planning::Prepared::needs_snap)
    {
        output["needsSnap"] = json!(identities);
        output["dependencyCacheVersions"] = json!(
            planned.materials
                .iter()
                .map(|material| {
                    let identity = material.output["id"]
                        .as_str()
                        .and_then(|id| id.rsplit_once('@'))
                        .ok_or_else(|| invalid("command dependency cache identity"))?
                        .0;
                    Ok(json!({"identity":identity,"version":material.version_name}))
                })
                .collect::<io::Result<Vec<_>>>()?
        );
    }
    Ok(())
}

pub(super) fn validate_versions(record: &mut Record) -> io::Result<()> {
    for row in
        record.context["versions"].as_array().ok_or_else(|| invalid("command context versions"))?
    {
        let reference =
            row[0].as_str().ok_or_else(|| invalid("command context version reference"))?;
        if record.repository.read(reference, "Version")? != row[1] {
            return Err(invalid("command Version changed during capture"));
        }
    }
    Ok(())
}

fn prepare_bitmap(record: &Record, planned: &planning::Planned) -> io::Result<bitmap::Prepared> {
    prepare_bitmap_bytes(record, planned, std::fs::read(record.request.root.join(".bitmap"))?)
}

pub(super) fn prepare_bitmap_bytes(
    record: &Record,
    planned: &planning::Planned,
    original: Vec<u8>,
) -> io::Result<bitmap::Prepared> {
    let mut updates = planned.materials
        .iter()
        .map(|material| bitmap_update(record, material))
        .collect::<io::Result<Vec<_>>>()?;
    if let Some(merge) = &planned.merge {
        updates.extend(merge.bitmap_updates()?);
    }
    let removed =
        planned.merge.as_ref().map_or_else(Vec::new, super::merge_planning::Prepared::removed_ids);
    let mut bitmap =
        bitmap::prepare_bytes(&record.request.root, original, &record.context, &updates, &removed)?;
    if record.request.operation == input::Operation::Switch {
        bitmap.switch_lane(&record.context)?;
    }
    Ok(bitmap)
}

fn bitmap_update(
    record: &Record,
    material: &materialization::Prepared,
) -> io::Result<bitmap::Update> {
    let identity = material.output["id"]
        .as_str()
        .and_then(|id| id.rsplit_once('@'))
        .map(|(identity, _)| identity)
        .ok_or_else(|| invalid("command bitmap identity"))?;
    let main_file = if material.keep_ours {
        record.targets
            .iter()
            .find(|target| target["identity"] == identity)
            .and_then(|target| target["mainFile"].as_str())
    } else {
        material.version["mainFile"].as_str()
    }
    .ok_or_else(|| invalid("command bitmap main file"))?;
    Ok(bitmap::Update {
        identity: identity.to_owned(),
        version: material.version_name.clone(),
        main_file: main_file.to_owned(),
        keep_ours: material.keep_ours,
    })
}
