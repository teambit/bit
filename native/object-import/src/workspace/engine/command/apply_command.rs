use super::{
    Apply, PreparedPlan, Record, State, bitmap, input, invalid, materialization, planning, proof,
};
use serde_json::{Value, json};
use std::io;

pub(super) fn run(input: &Apply, state: &mut State) -> io::Result<(usize, Value)> {
    bitmap::validate_history_file_id(&input.file_id)?;
    let mut record = state.record.take().ok_or_else(|| invalid("command owner absent"))?;
    if record.token != input.token {
        return Err(invalid("command apply token"));
    }
    let mut prepared = record.planned.take().ok_or_else(|| invalid("command not planned"))?;
    validate(&record, &prepared)?;
    record.repository.commit_import()?;
    prepared.plan.history.commit(&record.request.root)?;
    publish_sources(&mut prepared.plan)?;
    let (warning, notifications) = publish_bitmap(&mut prepared, &record, &input.file_id)?;
    let count = prepared.plan.result["components"].as_array().map_or(0, Vec::len);
    Ok((count, json!({"applied":true,"warning":warning,"postPersistNotifications":notifications})))
}
fn validate(record: &Record, prepared: &PreparedPlan) -> io::Result<()> {
    proof::verify(&record.proofs)?;
    record.repository.validate()?;
    prepared.bitmap.validate()?;
    planning::validate_sources(&prepared.plan)?;
    for material in &prepared.plan.materials {
        materialization::validate(material, &record.request.root)?;
    }
    if let Some(merge) = &prepared.plan.merge {
        merge.validate(&record.request.root)?;
    }
    Ok(())
}
fn publish_sources(plan: &mut planning::Planned) -> io::Result<()> {
    if let Some(merge) = &plan.merge {
        merge.remove()?;
    }
    for material in &plan.materials {
        materialization::remove(material)?;
    }
    if let Some(merge) = &mut plan.merge {
        merge.write()?;
    }
    for material in &plan.materials {
        materialization::write(material, &mut plan.transitions)?;
    }
    Ok(())
}
fn reason(record: &Record, plan: &planning::Planned) -> String {
    if record.request.operation == input::Operation::Merge {
        return "merge".to_owned();
    }
    if plan.materials.iter().all(|material| material.keep_ours) {
        return format!(
            "checkout ({})",
            record.request.options.pattern.as_deref().unwrap_or("undefined"),
        );
    }
    "checkout".to_owned()
}
fn publish_bitmap(
    prepared: &mut PreparedPlan,
    record: &Record,
    file_id: &str,
) -> io::Result<(Option<String>, usize)> {
    let mut warning = prepared.bitmap.commit(file_id, &reason(record, &prepared.plan))?;
    let notifications = match &mut prepared.plan.merge {
        Some(merge) => merge.finish_snap(&record.request.root)?,
        None => 0,
    };
    if let Some(bitmap) = &prepared.snap_bitmap {
        let message = record.request.options.message
            .as_deref()
            .filter(|message| !message.is_empty())
            .unwrap_or("N/A");
        warning = bitmap
            .commit(file_id, &format!("merge-snap (message: {message})"))?
            .or(warning);
    }
    Ok((warning, notifications))
}
// Canonical Repository.persist invokes its hook without awaiting completion. Native
// publication records each invocation and performs the same best-effort notification.
pub(super) fn notify(root: &std::path::Path) -> usize {
    let directory = root.join(".bit/events");
    let _notification = std::fs::create_dir_all(&directory)
        .and_then(|()| std::fs::write(directory.join("onPostObjectsPersist"), b""));
    1
}

#[cfg(test)]
mod tests;
