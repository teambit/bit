//! Invoke the external TypeScript compiler without importing Bit runtime modules.
use crate::discovery::{self, Target};
use serde_json::{Value, json};
use std::{
    io::{self, Write},
    process::{Command, Stdio},
};

pub(super) fn compile(files: &[Value]) -> io::Result<Vec<Value>> {
    let Target::Entry(cli) = discovery::find()? else {
        return Err(io::Error::other("compiler tool installation"));
    };
    let package = cli.bit_dir
        .ok_or_else(|| io::Error::other("compiler tool package root"))?
        .join("package.json");
    let config: Value = serde_json::from_str(include_str!(
        "../../../../../../scopes/react/react/typescript/tsconfig.json"
    ))?;
    let request = serde_json::to_vec(&json!({"config":config,"files":files}))?;
    let mut child = Command::new(cli.node)
        .arg("-e")
        .arg(include_str!("tool.cjs"))
        .arg(package)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let input = child.stdin
        .take()
        .ok_or_else(|| io::Error::other("compiler tool stdin"))?
        .write_all(&request);
    if let Err(error) = input {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    let output = child.wait_with_output()?;
    if !output.status.success() || !output.stderr.is_empty() {
        return Err(io::Error::other("compiler tool rejected source"));
    }
    let rows: Vec<Value> = serde_json::from_slice(&output.stdout)?;
    if rows.len() != files.len() {
        return Err(io::Error::other("compiler tool response count"));
    }
    Ok(rows)
}
