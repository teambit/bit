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
    plan.captured.reserve(phase.versions.len());
    let mut targets = Vec::with_capacity(phase.versions.len());
    for (identity, version) in &phase.versions {
        let identity = bare_id(identity);
        let version = version.trim();
        if identity.is_empty() || version.is_empty() {
            return Err(invalid("history phase target"));
        }
        if let Some(entry) = take_captured(&mut captured, identity) {
            plan.captured.push(entry);
            targets.push(
                record.targets
                    .iter()
                    .find(|row| row_bare_id(row) == Some(identity))
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

#[inline]
fn take_captured(
    captured: &mut [Option<capture::Captured>],
    identity: &str,
) -> Option<capture::Captured> {
    let index = captured
        .iter()
        .position(|row| {
            row.as_ref()
                .is_some_and(|row| bare_id(&row.target.identity) == identity)
        })?;
    captured[index].take()
}

#[inline]
fn bare_id(raw: &str) -> &str {
    let raw = raw.trim();
    raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim())
}

#[inline]
fn row_bare_id(row: &Value) -> Option<&str> {
    row["identity"]
        .as_str()
        .map(bare_id)
        .filter(|id| !id.is_empty())
        .or_else(|| {
            row["id"]
                .as_str()
                .map(bare_id)
                .filter(|id| !id.is_empty())
        })
}
#[inline]
pub(in crate::workspace::engine::command) fn added(
    target: &Value,
    captured: &capture::Captured,
) -> Option<Value> {
    captured.added.then(
        || json!({"kind":"target","version":target["historicalVersion"],"merge":false}),
    )
}

fn destination<'a>(context: &'a Value, identity: &str) -> io::Result<&'a Value> {
    let identity = bare_id(identity);
    let destination = context["scopeAdditions"]
        .as_array()
        .ok_or_else(|| invalid("history addition destinations"))?
        .iter()
        .find(|row| {
            let scope = row["scope"].as_str().map_or("", str::trim);
            let name = row["name"].as_str().map_or("", str::trim);
            identity
                .strip_prefix(scope)
                .and_then(|rest| rest.strip_prefix('/'))
                == Some(name)
        })
        .ok_or_else(|| invalid("history addition absent"))?;
    Ok(destination)
}
