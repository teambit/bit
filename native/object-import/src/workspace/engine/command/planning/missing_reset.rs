//! Node reports a missing tracked directory or main file restored by
//! `checkout reset` as an unchanged component and an addition, even though
//! files are written.

use super::{Planned, Record, input, invalid};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn report_if_applicable(
    record: &Record,
    plan: &mut Planned,
    recovery_reset: bool,
) -> io::Result<()> {
    if record.request.operation != input::Operation::Checkout
        || record.request.options.to.as_deref() != Some("reset")
        || recovery_reset
    {
        return Ok(());
    }
    for target in &record.targets {
        let identity =
            target["identity"].as_str().ok_or_else(|| invalid("reset missing identity"))?;
        let directory =
            target["directory"].as_str().ok_or_else(|| invalid("reset missing directory"))?;
        let main = target["mainFile"].as_str().ok_or_else(|| invalid("reset missing main file"))?;
        let root = record.request.root.join(directory);
        if !missing(&root)? && !missing(&root.join(main))? {
            continue;
        }
        report_one(plan, identity, target)?;
    }
    Ok(())
}

fn report_one(plan: &mut Planned, identity: &str, target: &Value) -> io::Result<()> {
    let version = target["version"].as_str().ok_or_else(|| invalid("reset missing version"))?;
    let id = format!("{identity}@{version}");
    if !plan.materials
        .iter()
        .any(|material| material.output["id"] == id)
    {
        return Err(invalid("reset missing materialization"));
    }
    let components = plan.result["components"]
        .as_array_mut()
        .ok_or_else(|| invalid("reset missing components"))?;
    components.retain(|component| component["id"] != id);
    plan.result["failedComponents"]
        .as_array_mut()
        .ok_or_else(|| invalid("reset missing failures"))?
        .push(json!({"id":id,"unchangedMessage":format!("component {identity} is not modified"),
            "unchangedLegitimately":true}));
    let added = plan.result
        .as_object_mut()
        .ok_or_else(|| invalid("reset missing result"))?
        .entry("addedComponents")
        .or_insert_with(|| json!([]));
    added
        .as_array_mut()
        .ok_or_else(|| invalid("reset missing additions"))?
        .push(Value::String(id));
    Ok(())
}

fn missing(path: &Path) -> io::Result<bool> {
    match path.symlink_metadata() {
        Ok(_) => Ok(false),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error),
    }
}
