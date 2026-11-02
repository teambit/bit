//! Publish Prettier's source bytes ([`apply`], [`publish_components`], [`filesystem`]) and preserve the formatter service's JSON errors.
use super::{Value, invalid};
use crate::commands::workspace_command::component_service::filesystem;
use std::{fs, io, path::Path};

/// Emits formatting progress or writes formatted component files when `check` is false.
#[inline]
pub(super) fn apply(
    check: bool,
    output: &bit_install::output::Output,
    loaded: &super::Loaded,
    components: &[crate::commands::workspace_command::component_service::Component],
    files: &[Value],
    result: &mut Value,
) -> io::Result<()> {
    if check {
        loaded.progress.print(output);
        return Ok(());
    }
    if let Some(error) =
        publish_components(&loaded.progress, output, components, &loaded.files, files)?
    {
        output.failure(&message(&loaded.progress.environment, &error)?);
        *result = serde_json::json!({"results":[],"errors":[error]});
    }
    Ok(())
}
/// Writes formatted output slices for each component in `components` while updating `progress`.
pub(super) fn publish_components(
    progress: &super::progress::Progress,
    output: &bit_install::output::Output,
    components: &[crate::commands::workspace_command::component_service::Component],
    inputs: &[Value],
    outputs: &[Value],
) -> io::Result<Option<Value>> {
    progress.start(output);
    let mut offset = 0usize;
    for (index, component) in components.iter().enumerate() {
        progress.component(output, index);
        let Some(end) = offset.checked_add(component.files.len()) else {
            return Err(invalid("formatter file slice bounds"));
        };
        let (Some(in_slice), Some(out_slice)) = (inputs.get(offset..end), outputs.get(offset..end))
        else {
            return Err(invalid("formatter file slice bounds"));
        };
        if let Some(error) = publish(in_slice, out_slice)? {
            return Ok(Some(error));
        }
        offset = end;
    }
    if offset != inputs.len() || offset != outputs.len() {
        return Err(invalid("formatter file slice bounds"));
    }
    Ok(None)
}

/// Verifies that every input file still matches its pre-formatted `source` text before writing.
#[inline]
pub(super) fn validate(inputs: &[Value]) -> io::Result<()> {
    for input in inputs {
        let path = path(input)?;
        let expected = input["source"].as_str().ok_or_else(|| invalid("formatter source text"))?;
        let metadata = fs::symlink_metadata(path)?;
        if !metadata.is_file()
            || metadata.len() != expected.len() as u64
            || fs::read_to_string(path)? != expected
        {
            return Err(invalid("formatter source changed"));
        }
    }
    Ok(())
}

/// Writes non-empty `newContent` slices from `outputs` to their corresponding `inputs` paths.
pub(super) fn publish(inputs: &[Value], outputs: &[Value]) -> io::Result<Option<Value>> {
    for (input, output) in inputs.iter().zip(outputs) {
        let Some(content) = output["newContent"]
            .as_str()
            .filter(|content| !content.is_empty())
        else {
            continue;
        };
        let path = path(input)?;
        if !fs::symlink_metadata(path).is_ok_and(|meta| meta.is_file()) {
            return Err(invalid("formatter source changed"));
        }
        if let Err(error) = fs::write(path, content) {
            return filesystem::error(error, path, "open").map(Some);
        }
    }
    Ok(None)
}
/// Extracts the trimmed non-empty `"absolutePath"` [`Path`] from a formatter `input` row.
#[inline]
fn path(input: &Value) -> io::Result<&Path> {
    input["absolutePath"]
        .as_str()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(Path::new)
        .filter(|path| path.is_absolute())
        .ok_or_else(|| invalid("formatter source path"))
}

#[inline]
pub(super) fn message(environment: &str, error: &Value) -> io::Result<String> {
    filesystem::message("formatter", environment.trim(), error)
}
