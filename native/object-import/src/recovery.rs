pub(crate) use operations::{Operation, State};

mod bitmap;
mod copy;
mod jsonc;
mod operations;
mod reset;

use serde_json::Value;
use std::{io, path::Path};

pub(crate) fn reset(input: &Value) -> io::Result<Value> {
    reset::plan(input)
}

pub(crate) fn bitmap(path: &Path, current: &[String]) -> io::Result<Value> {
    bitmap::plan(path, current)
}
pub(crate) fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
pub(crate) fn path(path: &Path) -> io::Result<()> {
    if !path.is_absolute()
        || path
            .to_str()
            .is_none_or(|name| name.len() > 32768 || name.contains('\0'))
    {
        return Err(invalid("invalid recovery path"));
    }
    Ok(())
}
#[cfg(test)]
mod tests;
