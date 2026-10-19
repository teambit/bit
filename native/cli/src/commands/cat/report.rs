//! `CatCmd.report` and `CatCmd.json` presentation of native Source bodies.

use super::Options;
use crate::commands::status::js::decline;
use serde_json::{Map, Value, json};
use std::io;

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
    if !value["version"].is_null() {
        output.insert("version".into(), value["version"].clone());
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

fn select(files: &[Value], requested: &str) -> io::Result<Value> {
    let normalized = requested.replace('\\', "/");
    files
        .iter()
        .find(|file| file["path"].as_str() == Some(normalized.as_str()))
        .cloned()
        .ok_or_else(|| decline("cat requested file absent"))
}

fn text_files(files: &[Value], single: bool) -> io::Result<String> {
    files
        .iter()
        .map(|file| {
            let path = file["path"].as_str().ok_or_else(|| decline("cat file path"))?;
            let content = file["content"].as_str().ok_or_else(|| decline("cat file content"))?;
            Ok(if single { content.to_owned() } else { format!("--- {path} ---\n{content}") })
        })
        .collect::<io::Result<Vec<_>>>()
        .map(|files| files.join("\n\n"))
}

fn text_config(config: &Value) -> io::Result<String> {
    let mut lines = Vec::new();
    if let Some(env) = config["env"]
        .as_str()
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
            let version = version.as_str().ok_or_else(|| decline("cat dependency version"))?;
            lines.push(format!("  {name}: {version}"));
        }
    }
    Ok(lines.join("\n"))
}
