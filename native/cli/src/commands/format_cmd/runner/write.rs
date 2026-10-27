//! Publish Prettier's source bytes and preserve the formatter service's JSON errors.
use super::{Value, invalid};
use crate::commands::workspace_command::component_service::filesystem;
use std::{fs, io, path::Path};

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

pub(super) fn message(error: &Value) -> io::Result<String> {
    filesystem::message("formatter", error)
}
