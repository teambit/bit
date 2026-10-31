//! `CatCmd.report` and `CatCmd.json` presentation of native Source bodies.

use super::Options;
use crate::commands::status::js::decline;
use serde_json::{Map, Value, json};
use std::{
    io,
    path::{Component, Path},
};

pub(super) fn render(value: &Value, options: &Options<'_>) -> io::Result<String> {
    let files = value["files"].as_array().ok_or_else(|| decline("cat files"))?;
    let show_files = !options.config || options.all;
    let show_config = options.config || options.all;
    let selected = options.file.map(|file| select(files, file)).transpose()?;
    if options.json {
        return json_report(value, files, selected, show_files, show_config);
    }
    let mut sections = Vec::new();
    if show_files {
        let files = selected.map_or_else(|| files.clone(), |file| vec![file]);
        sections.push(text_files(&files, options.file.is_some())?);
    }
    if show_config {
        sections.push(text_config(&value["config"])?);
    }
    Ok(sections.join("\n\n"))
}

fn json_report(
    value: &Value,
    files: &[Value],
    selected: Option<Value>,
    show_files: bool,
    show_config: bool,
) -> io::Result<String> {
    let mut output = Map::new();
    output.insert("id".into(), value["id"].clone());
    let version = if value["version"].is_null() { &value["head"] } else { &value["version"] };
    if !version.is_null() {
        output.insert("version".into(), version.clone());
    }
    if show_files {
        output.insert(
            "files".into(),
            json!(selected.map_or_else(|| files.to_vec(), |file| vec![file])),
        );
    }
    if show_config {
        output.insert("config".into(), value["config"].clone());
    }
    serde_json::to_string_pretty(&Value::Object(output)).map_err(io::Error::other)
}

pub(super) fn select(files: &[Value], requested: &str) -> io::Result<Value> {
    let normalized = requested
        .trim()
        .replace('\\', "/")
        .trim_start_matches("./")
        .to_owned();
    files
        .iter()
        .find(|file| {
            file_path(file)
                .is_some_and(|candidate| {
                    candidate.replace('\\', "/").trim_start_matches("./") == normalized
                })
        })
        .cloned()
        .ok_or_else(|| decline("cat requested file absent"))
}

fn text_files(files: &[Value], single: bool) -> io::Result<String> {
    files
        .iter()
        .map(|file| {
            let path = file_path(file).ok_or_else(|| decline("cat file path"))?;
            let content = file["content"].as_str().ok_or_else(|| decline("cat file content"))?;
            Ok(if single { content.to_owned() } else { format!("--- {path} ---\n{content}") })
        })
        .collect::<io::Result<Vec<_>>>()
        .map(|files| files.join("\n\n"))
}

fn file_path(file: &Value) -> Option<&str> {
    file["path"]
        .as_str()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .or_else(|| {
            file["relativePath"]
                .as_str()
                .map(str::trim)
                .filter(|path| !path.is_empty())
        })
}

fn text_config(config: &Value) -> io::Result<String> {
    let mut lines = Vec::new();
    if let Some(env) = config["env"]
        .as_str()
        .map(str::trim)
        .filter(|env| !env.is_empty())
    {
        lines.push(format!("env: {env}"));
    }
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        let Some(deps) = config[field].as_object() else { continue };
        if deps.is_empty() {
            continue;
        }
        lines.push(format!("{field}:"));
        for (name, version) in deps {
            let name = name.trim();
            let version = version
                .as_str()
                .map(str::trim)
                .ok_or_else(|| decline("cat dependency version"))?;
            lines.push(format!("  {name}: {version}"));
        }
    }
    Ok(lines.join("\n"))
}

pub(super) fn source_files(directory: &Path, names: &[String]) -> io::Result<Vec<Value>> {
    if names.len() > 16_384 {
        return Err(decline("cat workspace file count budget"));
    }
    let mut current = Vec::with_capacity(names.len());
    let mut remaining = 96 * 1024 * 1024_u64;
    for name in names {
        if !safe_relative(name) {
            return Err(decline("cat workspace file path"));
        }
        let path = directory.join(name);
        let metadata = std::fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || metadata.len() > 8 * 1024 * 1024
            || metadata.len() > remaining
        {
            return Err(decline("cat workspace file shape or size"));
        }
        let bytes = std::fs::read(path)?;
        remaining = remaining
            .checked_sub(bytes.len() as u64)
            .ok_or_else(|| decline("cat workspace source budget"))?;
        current.push(json!({"path":name,"content":String::from_utf8_lossy(&bytes)}));
    }
    Ok(current)
}

pub(super) fn safe_relative(path: &str) -> bool {
    path == "."
        || (!path.is_empty()
            && Path::new(path)
                .components()
                .all(|component| matches!(component, Component::Normal(_))))
}
