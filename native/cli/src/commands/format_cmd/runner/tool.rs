//! Invoke only the external Prettier API, without loading Bit runtime modules.
use super::{Value, invalid};
use crate::discovery::{self, Target};
use std::{
    io::{self, Write},
    process::{Command, Stdio},
};
pub(super) fn format(files: &[Value]) -> io::Result<Vec<Value>> {
    let Target::Entry(cli) = discovery::find()? else {
        return Err(invalid("formatter tool installation"));
    };
    let package =
        cli.bit_dir.ok_or_else(|| invalid("formatter tool package root"))?.join("package.json");
    let mut child = Command::new(cli.node)
        .arg("-e")
        .arg(include_str!("tool.cjs"))
        .arg(package)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let bytes = serde_json::to_vec(files)?;
    child.stdin
        .take()
        .ok_or_else(|| invalid("formatter tool stdin"))?
        .write_all(&bytes)?;
    let output = child.wait_with_output()?;
    if !output.status.success() || !output.stderr.is_empty() {
        return Err(invalid("formatter tool rejected source"));
    }
    serde_json::from_slice(&output.stdout).map_err(io::Error::other)
}
