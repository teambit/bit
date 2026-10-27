//! Preserve external TypeScript parser diagnostics without loading Bit's dependency detectors.
use crate::discovery::{self, Target};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{self, Write},
    path::Path,
    process::{Command, Stdio},
};

pub(in crate::commands) fn parse(
    root: &Path,
    target: &Value,
    files: &[String],
    custom: &Value,
) -> io::Result<Value> {
    let directory = target["directory"]
        .as_str()
        .ok_or_else(|| io::Error::other("compiler parser directory"))?;
    let mut inputs = Vec::new();
    for file in files {
        let path = root.join(directory).join(file);
        let source = fs::read_to_string(&path)?;
        let scanned = bit_dependency_scanner::scan_source(
            path.to_string_lossy().into_owned(),
            source.clone(),
        )?;
        if scanned["status"] == "parse_error" {
            inputs.push(json!({"path":path,"source":source}));
        }
    }
    if inputs.is_empty() {
        return Err(io::Error::other("compiler dependency syntax requires another detector"));
    }
    let errors = errors(&inputs)?;
    let mut result = custom
        .as_object()
        .cloned()
        .unwrap_or_default();
    for (input, error) in inputs.iter().zip(errors) {
        if !error.is_object() {
            return Err(io::Error::other("compiler parser diagnostic unavailable"));
        }
        let path =
            input["path"].as_str().ok_or_else(|| io::Error::other("compiler parser path"))?;
        let source =
            input["source"].as_str().ok_or_else(|| io::Error::other("compiler parser source"))?;
        result.insert(path.to_owned(), json!({"dependencies":[],"typescript":true,"sourceHash":format!("{:x}",Sha1::digest(source.as_bytes())),"error":error}));
    }
    Ok(Value::Object(result))
}
fn errors(inputs: &[Value]) -> io::Result<Vec<Value>> {
    let Target::Entry(cli) = discovery::find()? else {
        return Err(io::Error::other("compiler parser installation"));
    };
    let package = cli.bit_dir
        .ok_or_else(|| io::Error::other("compiler parser package"))?
        .join("package.json");
    let mut child = Command::new(cli.node)
        .arg("-e")
        .arg(include_str!("syntax.cjs"))
        .arg(package)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let request = serde_json::to_vec(inputs)?;
    let input = child.stdin
        .take()
        .ok_or_else(|| io::Error::other("compiler parser stdin"))?
        .write_all(&request);
    if let Err(error) = input {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    let output = child.wait_with_output()?;
    if !output.status.success() || !output.stderr.is_empty() {
        return Err(io::Error::other("compiler parser diagnostic tool"));
    }
    let errors: Vec<Value> = serde_json::from_slice(&output.stdout)?;
    if errors.len() != inputs.len() {
        return Err(io::Error::other("compiler parser result count"));
    }
    Ok(errors)
}
