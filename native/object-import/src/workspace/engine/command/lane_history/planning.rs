//! Insert absent historical components at their original position before selection.
use super::{invalid, phase};
use crate::workspace::engine::command::{Record, capture, planning::Planned};
use serde_json::{Value, json};
use std::io;

pub(in crate::workspace::engine::command) fn attach(
    record: &mut Record,
    plan: &mut Planned,
) -> io::Result<()> {
    let Some(phase) = phase(&record.request.options) else { return Ok(()) };
    let mut captured = std::mem::take(&mut plan.captured)
        .into_iter()
        .map(Some)
        .collect::<Vec<_>>();
    let mut targets = Vec::new();
    for (identity, version) in &phase.versions {
        if let Some(index) = captured
            .iter()
            .position(|row| {
                row.as_ref()
                    .is_some_and(|row| row.target.identity == *identity)
            })
        {
            if let Some(entry) = captured[index].take() {
                plan.captured.push(entry);
            }
            targets.push(
                record.targets
                    .iter()
                    .find(|row| row["identity"] == *identity)
                    .ok_or_else(|| invalid("history current target"))?
                    .clone(),
            );
        } else {
            let destination = destination(&record.context, identity)?;
            plan.captured.push(capture::addition(identity, destination)?);
            targets.push(json!({"identity":identity,"version":"","directory":destination["rootDir"],"historicalVersion":version}));
        }
    }
    if captured.iter().any(Option::is_some) {
        return Err(invalid("history unexpected current component"));
    }
    record.targets = targets;
    Ok(())
}
pub(in crate::workspace::engine::command) fn added(
    target: &Value,
    captured: &capture::Captured,
) -> Option<Value> {
    captured.added.then(
        || json!({"kind":"target","version":target["historicalVersion"],"merge":false}),
    )
}

fn destination<'a>(context: &'a Value, identity: &str) -> io::Result<&'a Value> {
    let destination = context["scopeAdditions"]
        .as_array()
        .ok_or_else(|| invalid("history addition destinations"))?
        .iter()
        .find(|row| {
            format!(
                "{}/{}",
                row["scope"].as_str().unwrap_or_default(),
                row["name"].as_str().unwrap_or_default(),
            ) == *identity
        })
        .ok_or_else(|| invalid("history addition absent"))?;
    Ok(destination)
}
