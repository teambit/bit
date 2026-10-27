//! Publish Prettier's source bytes and preserve the formatter service's JSON errors.
use super::{Value, invalid, json};
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
        let content =
            if cfg!(windows) { content.replace('\n', "\r\n") } else { content.to_owned() };
        if let Err(error) = fs::write(path, content) {
            return failure(error, path).map(Some);
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
fn failure(error: io::Error, path: &Path) -> io::Result<Value> {
    let (code, unix_errno, windows_errno) = match error.kind() {
        io::ErrorKind::PermissionDenied => ("EACCES", -13, -4092),
        io::ErrorKind::NotFound => ("ENOENT", -2, -4058),
        io::ErrorKind::NotADirectory => ("ENOTDIR", -20, -4052),
        io::ErrorKind::IsADirectory => ("EISDIR", -21, -4068),
        io::ErrorKind::ReadOnlyFilesystem => ("EROFS", -30, -4034),
        _ => return Err(error),
    };
    let errno = if cfg!(windows) { windows_errno } else { unix_errno };
    Ok(json!({"errno":errno,"code":code,"syscall":"open","path":path}))
}

pub(super) fn message(error: &Value) -> io::Result<String> {
    let code = error["code"].as_str().ok_or_else(|| invalid("formatter error code"))?;
    let description = match code {
        "EACCES" => "permission denied",
        "ENOENT" => "no such file or directory",
        "ENOTDIR" => "not a directory",
        "EISDIR" => "illegal operation on a directory",
        "EROFS" => "read-only file system",
        _ => return Err(invalid("formatter filesystem error")),
    };
    let path = error["path"].as_str().ok_or_else(|| invalid("formatter error path"))?;
    Ok(format!(
        r#"service "formatter" of env "teambit.harmony/node" has failed. error: {code}: {description}, open '{path}'"#,
    ))
}
