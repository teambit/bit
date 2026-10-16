//! Validate the bounded inbound command protocol before remote reads or writes.
use super::{Prepare, invalid};
use std::io;

pub(super) fn validate(input: &Prepare) -> io::Result<()> {
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
    if input.options.from_original_scope || !valid_operation(input) {
        return Err(invalid("inbound command requires canonical lifecycle"));
    }
    validate_override(input)?;
    validate_merge(input)?;
    validate_dependencies(input)?;
    if input.options.lanes
        && (input.ids.is_empty() || input.ids.len() > 32 || input.options.all_history)
    {
        return Err(invalid("inbound lanes require explicit IDs"));
    }
    if !valid_write_mode(input) || input.root.join(".bitTmp").try_exists()? {
        return Err(invalid("inbound command requires canonical lifecycle"));
    }
    Ok(())
}
fn validate_override(input: &Prepare) -> io::Result<()> {
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
    let Some(strategy) = input.options.resolution.merge_strategy.as_deref() else {
        return Ok(());
    };
    if input.operation != "import"
        || input.options.objects_only
        || input.ids.len() != 1
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
