//! Invoke the external TypeScript compiler without importing Bit runtime modules.
use crate::discovery::{self, Target};
use serde_json::{Value, json};
use std::{
    io::{self, Write},
    process::{Command, Stdio},
};

pub(super) fn compile(files: &[Value]) -> io::Result<Vec<Value>> {
    if files.is_empty() {
        return Ok(Vec::new());
    }
    let (node, package) = resolve_compiler_tool()?;
    let config: Value = serde_json::from_str(include_str!(
        "../../../../../../scopes/react/react/typescript/tsconfig.json"
    ))?;
    let request = serde_json::to_vec(&json!({"config":config,"files":files}))?;
    let mut child = Command::new(node)
        .arg("-e")
        .arg(include_str!("tool.cjs"))
        .arg(package)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    write_compiler_request(&mut child, &request)?;
    let output = child.wait_with_output()?;
    if !output.status.success() || !String::from_utf8_lossy(&output.stderr).trim().is_empty() {
        return Err(io::Error::other("compiler tool rejected source"));
    }
    let rows: Vec<Value> = serde_json::from_slice(&output.stdout)?;
    if rows.len() != files.len() {
        return Err(io::Error::other("compiler tool response count"));
    }
    Ok(rows)
}

fn resolve_compiler_tool() -> io::Result<(std::path::PathBuf, std::path::PathBuf)> {
    let Target::Entry(cli) = discovery::find()? else {
        return Err(io::Error::other("compiler tool installation"));
    };
    if cli.node
        .to_string_lossy()
        .trim()
        .is_empty()
    {
        return Err(io::Error::other("compiler tool node binary"));
    }
    let package = cli.bit_dir
        .ok_or_else(|| io::Error::other("compiler tool package root"))?
        .join("package.json");
    if !package.is_file() {
        return Err(io::Error::other("compiler tool package manifest"));
    }
    Ok((cli.node, package))
}

fn write_compiler_request(child: &mut std::process::Child, request: &[u8]) -> io::Result<()> {
    let input = child.stdin
        .take()
        .ok_or_else(|| io::Error::other("compiler tool stdin"))?
        .write_all(request);
    if let Err(error) = input {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    Ok(())
}
