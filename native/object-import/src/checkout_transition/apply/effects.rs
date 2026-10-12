use super::{
    super::{invalid, plan},
    File, error_path, path,
};
use serde_json::{Map, Value, json};
use std::io;
pub(super) fn apply(
    plan: &plan::Plan,
    files: &mut Vec<File>,
    status: &mut Map<String, Value>,
) -> io::Result<Option<String>> {
    for kind in [
        "modifiedFiles",
        "addFiles",
        "deletedConflictFiles",
        "removeFiles",
        "remainDeletedFiles",
        "deletedConflictStatus",
        "overrideFiles",
        "updatedFiles",
    ] {
        let wanted = if kind == "deletedConflictStatus" { "deletedConflictFiles" } else { kind };
        for row in plan.merge_rows
            .iter()
            .filter(|row| row["kind"].as_str() == Some(wanted))
        {
            let path = path(plan, row)?;
            if let Some(error) = effect(kind, plan, row, &path, files, status)? {
                return Ok(Some(error));
            }
        }
    }
    Ok(None)
}
fn effect(
    kind: &str,
    plan: &plan::Plan,
    row: &Value,
    path: &str,
    files: &mut Vec<File>,
    status: &mut Map<String, Value>,
) -> io::Result<Option<String>> {
    match kind {
        "modifiedFiles" => modified(plan, row, path, files, status),
        "addFiles" | "deletedConflictFiles" => {
            add(plan, row, path, files, status)?;
            Ok(None)
        }
        "removeFiles" | "remainDeletedFiles" => {
            files.retain(|file| file.path != path);
            status.insert(
                path.into(),
                json!(if kind == "removeFiles" { "removed" } else { "remainDeleted" }),
            );
            Ok(None)
        }
        "deletedConflictStatus" => {
            status.insert(path.into(), json!("deletedConflict"));
            Ok(None)
        }
        "overrideFiles" | "updatedFiles" => update(kind, row, path, files, status),
        _ => Err(invalid("checkout unsupported merge effect")),
    }
}
fn modified(
    plan: &plan::Plan,
    row: &Value,
    path: &str,
    files: &mut [File],
    status: &mut Map<String, Value>,
) -> io::Result<Option<String>> {
    let Some(file) = files
        .iter_mut()
        .find(|file| file.path == path)
    else {
        return Ok(Some(format!("file {} not found", error_path(path))));
    };
    let (index, kind) = if let Some(index) = row["conflictPlanIndex"].as_u64() {
        (index as usize, "manual")
    } else if let Some(index) = row["outputPlanIndex"].as_u64() {
        (index as usize, "merged")
    } else if row["isBinaryConflict"] == true {
        let index = row["current"]
            .as_u64()
            .ok_or_else(|| invalid("checkout binary current index"))? as usize;
        (
            plan.current
                .get(index)
                .ok_or_else(|| invalid("checkout binary current file"))?
                .plan_index,
            "binaryConflict",
        )
    } else {
        return Ok(Some(format!("file {} does not have output nor conflict", error_path(path))));
    };
    file.plan_index = index;
    status.insert(path.into(), json!(kind));
    Ok(None)
}
fn add(
    plan: &plan::Plan,
    row: &Value,
    path: &str,
    files: &mut Vec<File>,
    status: &mut Map<String, Value>,
) -> io::Result<()> {
    if row["kind"] == "deletedConflictFiles" && row.get("bodyPlanIndex").is_none() {
        return Ok(());
    }
    if files
        .iter()
        .any(|file| file.path == path)
    {
        return Ok(());
    }
    let source = if let Some(index) = row["current"].as_u64() {
        let index = index as usize;
        Some((
            "current",
            index,
            plan.current.get(index).ok_or_else(|| invalid("checkout add current"))?.plan_index,
        ))
    } else if let (Some(index), Some(body)) = (row["other"].as_u64(), row["bodyPlanIndex"].as_u64())
    {
        Some(("target", index as usize, body as usize))
    } else {
        None
    };
    if let Some((kind, index, plan_index)) = source {
        files.push(File { kind, index, plan_index, path: path.into() });
        status.insert(path.into(), json!("added"));
    }
    Ok(())
}
fn update(
    kind: &str,
    row: &Value,
    path: &str,
    files: &mut [File],
    status: &mut Map<String, Value>,
) -> io::Result<Option<String>> {
    let Some(file) = files
        .iter_mut()
        .find(|file| file.path == path)
    else {
        return Ok(Some(format!("file {} not found", error_path(path))));
    };
    file.plan_index = row["bodyPlanIndex"]
        .as_u64()
        .ok_or_else(|| invalid("checkout update body missing"))? as usize;
    status.insert(
        path.into(),
        json!(if kind == "overrideFiles" { "overridden" } else { "updated" }),
    );
    Ok(None)
}
