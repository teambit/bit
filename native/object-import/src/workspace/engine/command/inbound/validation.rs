//! Validate the bounded inbound command protocol before remote reads or writes.
use super::{Prepare, invalid};
use serde_json::Value;
use std::io;

pub(super) fn validate(input: &Prepare) -> io::Result<()> {
    validate_phase(input, true)
}
pub(super) fn local(input: &Prepare) -> io::Result<()> {
    validate_phase(input, false)
}
fn validate_phase(input: &Prepare, publication: bool) -> io::Result<()> {
    for path in
        [&input.root, &input.home, &input.global_remotes_file, &input.transport.global_config_dir]
    {
        super::super::super::path(path)?;
    }
    if !input.transport.node_executable.is_absolute()
        || input.transport.bit_version.is_empty()
        || input.ids.len() > 4096
    {
        return Err(invalid("inbound command requires canonical lifecycle"));
    }
    if input.options.from_original_scope
        || !valid_operation(input)
        || has_local_unscoped_conflict(input)?
    {
        return Err(invalid("inbound command requires canonical lifecycle"));
    }
    validate_override(input)?;
    validate_merge(input)?;
    validate_dependencies(input)?;
    validate_lane_ids(input)?;
    validate_adoption(input)?;
    if publication && !valid_write_mode(input) || input.root.join(".bitTmp").try_exists()? {
        return Err(invalid("inbound command requires canonical lifecycle"));
    }
    Ok(())
}
fn validate_lane_ids(input: &Prepare) -> io::Result<()> {
    if input.options.lanes && input.ids.len() > 33 {
        return Err(invalid("inbound lanes require explicit IDs"));
    }
    if input.operation == "laneImport" && input.ids.len() != 1 {
        return Err(invalid("lane import requires one lane"));
    }
    Ok(())
}
fn validate_override(input: &Prepare) -> io::Result<()> {
    if input.options.resolution.recovery_local
        && (input.operation != "import"
            || input.options.objects_only
            || !input.options.resolution.override_existing)
    {
        return Err(invalid("recovery cache requires explicit overriding workspace import"));
    }
    if input.options.resolution.override_existing
        && (input.operation != "import"
            || input.options.objects_only
            || input.ids.is_empty())
    {
        return Err(invalid("inbound override requires explicit workspace import"));
    }
    if input.options.resolution.path.is_some()
        && (input.operation != "import"
            || input.options.objects_only
            || input.ids.len() != 1)
    {
        return Err(invalid("inbound path requires one explicit workspace import"));
    }
    Ok(())
}
fn validate_merge(input: &Prepare) -> io::Result<()> {
    let Some(strategy) = input.options.resolution.merge_strategy
        .as_deref()
        .map(str::trim)
        .filter(|strategy| !strategy.is_empty())
    else {
        return Ok(());
    };
    if input.operation != "import"
        || input.options.objects_only
        || input.ids.is_empty()
        || input.options.resolution.override_existing
        || !matches!(strategy, "manual" | "ours" | "theirs")
    {
        return Err(invalid("inbound merge requires one explicit workspace import"));
    }
    Ok(())
}
fn validate_dependencies(input: &Prepare) -> io::Result<()> {
    let options = &input.options.dependencies;
    if !options.import_dependencies && !options.import_head_dependencies {
        if options.dependencies_depth.is_some() {
            return Err(invalid("inbound dependency depth requires dependency import"));
        }
        return Ok(());
    }
    let invalid_mode = options.import_dependencies == options.import_head_dependencies
        || input.operation != "import"
        || input.options.objects_only
        || input.options.lanes
        || input.ids.is_empty();
    let conflicting_write = input.options.resolution.override_existing
        || input.options.resolution.merge_strategy.is_some()
        || input.options.resolution.path.is_some();
    let invalid_depth = options.dependencies_depth.is_some_and(|depth| depth == 0 || depth > 4096);
    if invalid_mode || conflicting_write || invalid_depth {
        return Err(invalid("inbound dependencies require explicit workspace import"));
    }
    Ok(())
}
fn valid_operation(input: &Prepare) -> bool {
    match input.operation.as_str() {
        "fetch" => {
            (input.options.components || input.options.lanes)
                && input.options.components != input.options.lanes
                && input.options.objects_only
        }
        "import" => !input.options.components,
        "laneImport" => {
            input.options.lanes && input.options.objects_only && !input.options.components
        }
        "diff" => {
            input.options.objects_only
                && !input.options.components
                && !input.options.lanes
                && !input.options.all_history
                && !input.ids.is_empty()
        }
        "status" => {
            input.options.objects_only
                && !input.options.components
                && !input.ids.is_empty()
                && (input.options.all_history != input.options.lanes)
        }
        _ => false,
    }
}
/// Objects-only imports write no bitmap history. A write keeps one; the caller
/// installs dependencies after publication unless they are skipped.
fn valid_write_mode(input: &Prepare) -> bool {
    if input.options.objects_only {
        !input.options.skip_dependency_installation
            && input.bitmap_history_file_id.is_none()
    } else {
        input.bitmap_history_file_id.is_some()
    }
}

fn is_unscoped_match(key: &str, row: &Value, raw_id: &str) -> bool {
    let key = key.trim();
    let raw_id = raw_id.trim();
    if key.starts_with('$') || matches!(key, "_bit_lane" | "version") || !row.is_object() {
        return false;
    }
    let has_scope = row["scope"]
        .as_str()
        .is_some_and(|scope| !scope.trim().is_empty());
    !has_scope && (key == raw_id || crate::reset_lane::bitmap::row_identity(key, row).1 == raw_id)
}

fn has_local_unscoped_conflict(input: &Prepare) -> io::Result<bool> {
    let Ok(bitmap) = super::config::document(&input.root.join(".bitmap")) else {
        return Ok(false);
    };
    let Some(rows) = bitmap.as_object() else {
        return Ok(false);
    };
    for id in &input.ids {
        let (raw_id, _) = id
            .split_once('@')
            .unwrap_or((id.as_str(), ""));
        if rows.iter().any(|(key, row)| is_unscoped_match(key, row, raw_id)) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn validate_adoption(input: &Prepare) -> io::Result<()> {
    let adoption = &input.options.resolution.adoption;
    let dependents = &input.options.dependencies.dependents;
    let graph = dependents.enabled || !dependents.via.is_empty();
    if (adoption.track_only
        || adoption.write_to_empty_dir
        || adoption.write_deps.is_some()
        || graph)
        && (input.operation != "import" || input.options.objects_only)
    {
        return Err(invalid("inbound adoption requires workspace import"));
    }
    if graph && (!dependents.silent || dependents.via.len() > 4096) {
        return Err(invalid("inbound interactive dependents"));
    }
    for id in &dependents.via {
        super::requested_target(id)?;
    }
    Ok(())
}
