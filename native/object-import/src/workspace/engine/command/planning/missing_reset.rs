//! Node reports a missing tracked directory or main file restored by
//! `checkout reset` as an unchanged component and an addition, even though
//! files are written.

use super::{Planned, Record, input, invalid};
use serde_json::{Value, json};
use std::{io, path::Path};

/// Appends restored missing directories or main files to the checkout reset report.
#[inline]
pub(super) fn report_if_applicable(
    record: &Record,
    plan: &mut Planned,
    recovery_reset: bool,
) -> io::Result<()> {
    let to = record.request.options.to.as_deref().map(str::trim);
    if record.request.operation != input::Operation::Checkout
        || !to.is_some_and(|to| to.eq_ignore_ascii_case("reset"))
        || recovery_reset
    {
        return Ok(());
    }
    for target in &record.targets {
        let identity = target["identity"]
            .as_str()
            .or_else(|| target["id"].as_str())
            .map(str::trim)
            .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base.trim()))
            .filter(|id| !id.is_empty())
            .ok_or_else(|| invalid("reset missing identity"))?;
        let (directory, main) = target_paths(target)?;
        let root = record.request.root.join(directory);
        if !missing(&root)? && !missing(&root.join(main))? {
            continue;
        }
        report_one(plan, identity, target)?;
    }
    Ok(())
}

#[inline]
fn target_paths(target: &Value) -> io::Result<(&str, &str)> {
    let directory = target["directory"]
        .as_str()
        .map(str::trim)
        .filter(|directory| !directory.is_empty())
        .ok_or_else(|| invalid("reset missing directory"))?;
    if directory != "." {
        crate::checkout::plan::relative_path(directory)?;
    }
    let main = target["mainFile"]
        .as_str()
        .map(str::trim)
        .filter(|main| !main.is_empty())
        .ok_or_else(|| invalid("reset missing main file"))?;
    crate::checkout::plan::relative_path(main)?;
    Ok((directory, main))
}

fn report_one(plan: &mut Planned, identity: &str, target: &Value) -> io::Result<()> {
    let version = target["version"]
        .as_str()
        .or_else(|| target["head"].as_str())
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .ok_or_else(|| invalid("reset missing version"))?;
    let id = format!("{identity}@{version}");
    if !plan.materials
        .iter()
        .any(|material| material.output["id"].as_str().map(str::trim) == Some(id.as_str()))
    {
        return Err(invalid("reset missing materialization"));
    }
    let result = plan.result.as_object_mut().ok_or_else(|| invalid("reset missing result"))?;
    result
        .get_mut("components")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| invalid("reset missing components"))?
        .retain(|component| component["id"].as_str().map(str::trim) != Some(id.as_str()));
    result
        .get_mut("failedComponents")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| invalid("reset missing failures"))?
        .push(json!({"id":id,"unchangedMessage":format!("component {identity} is not modified"),
            "unchangedLegitimately":true}));
    result
        .entry("addedComponents")
        .or_insert_with(|| json!([]))
        .as_array_mut()
        .ok_or_else(|| invalid("reset missing additions"))?
        .push(Value::String(id));
    Ok(())
}

#[inline]
fn missing(path: &Path) -> io::Result<bool> {
    match path.symlink_metadata() {
        Ok(_) => Ok(false),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error),
    }
}
