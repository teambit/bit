//! Invoke the external `TypeScript` compiler ([`Target`]) without importing Bit runtime modules.
//!
//! Runs [`compile`] via `tool.cjs` using the bundled React/`TypeScript` `tsconfig.json`.
use crate::discovery::{self, Target};
use serde_json::{Value, json};
use std::{
    io::{self, Write},
    process::{Command, Stdio},
};

/// Transpiles source `files` in a single batch using the discovered `TypeScript` compiler [`Target`] via [`resolve_compiler_tool`].
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
    if !output.status.success() || !output.stderr.trim_ascii().is_empty() {
        return Err(io::Error::other("compiler tool rejected source"));
    }
    let rows: Vec<Value> = serde_json::from_slice(&output.stdout)?;
    if rows.len() != files.len() {
        return Err(io::Error::other("compiler tool response count"));
    }
    Ok(rows)
}

/// Resolves the `Node.js` binary path and Bit `package.json` manifest for the external compiler helper via [`discovery::find`].
#[inline]
fn resolve_compiler_tool() -> io::Result<(std::path::PathBuf, std::path::PathBuf)> {
    let Target::Entry(cli) = discovery::find()? else {
        return Err(io::Error::other("compiler tool installation"));
    };
    if cli.node
        .as_os_str()
        .as_encoded_bytes()
        .iter()
        .all(u8::is_ascii_whitespace)
    {
        return Err(io::Error::other("compiler tool node binary"));
    }
    let package = cli.bit_dir
        .filter(|dir| {
            !dir.as_os_str()
                .as_encoded_bytes()
                .iter()
                .all(u8::is_ascii_whitespace)
        })
        .ok_or_else(|| io::Error::other("compiler tool package root"))?
        .join("package.json");
    if !package.is_file() {
        return Err(io::Error::other("compiler tool package manifest"));
    }
    Ok((cli.node, package))
}

/// Sends the JSON compilation `request` payload to `child`'s stdin and flushes the stream for [`compile`].
#[inline]
fn write_compiler_request(child: &mut std::process::Child, request: &[u8]) -> io::Result<()> {
    let mut stdin = child.stdin.take().ok_or_else(|| io::Error::other("compiler tool stdin"))?;
    let input = stdin.write_all(request).and_then(|()| stdin.flush());
    if let Err(error) = input {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    Ok(())
}
