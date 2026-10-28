//! Publish Prettier's source bytes and preserve the formatter service's JSON errors.
use super::{Value, invalid};
use crate::commands::workspace_command::component_service::filesystem;
use std::{fs, io, path::Path};

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
pub(super) fn publish_components(
    progress: &super::progress::Progress,
    output: &bit_install::output::Output,
    components: &[crate::commands::workspace_command::component_service::Component],
    inputs: &[Value],
    outputs: &[Value],
) -> io::Result<Option<Value>> {
    progress.start(output);
    let mut offset = 0;
    for (index, component) in components.iter().enumerate() {
        progress.component(output, index);
        let end = offset + component.files.len();
        if let Some(error) = publish(&inputs[offset..end], &outputs[offset..end])? {
            return Ok(Some(error));
        }
        offset = end;
    }
    Ok(None)
}

pub(super) fn validate(inputs: &[Value]) -> io::Result<()> {
    for input in inputs {
        let path = path(input)?;
        if fs::read_to_string(path)? != input["source"].as_str().unwrap_or_default() {
            return Err(invalid("formatter source changed"));
        }
    }
    Ok(())
}

pub(super) fn publish(inputs: &[Value], outputs: &[Value]) -> io::Result<Option<Value>> {
    for (input, output) in inputs.iter().zip(outputs) {
        let Some(content) = output["newContent"]
            .as_str()
            .filter(|content| !content.is_empty())
        else {
            continue;
        };
        let path = path(input)?;
        if let Err(error) = fs::write(path, content) {
            return filesystem::error(error, path, "open").map(Some);
        }
    }
    Ok(None)
}
fn path(input: &Value) -> io::Result<&Path> {
    input["absolutePath"]
        .as_str()
        .map(Path::new)
        .ok_or_else(|| invalid("formatter source path"))
}

pub(super) fn message(environment: &str, error: &Value) -> io::Result<String> {
    filesystem::message("formatter", environment, error)
}
