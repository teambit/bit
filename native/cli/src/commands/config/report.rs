//! `ConfigGet` and `ConfigList` formatting, including the released origin ordering.
use super::{options::Options, stores::Stores};
use crate::commands::color::Chalk;
use bit_workspace_config::{environment_value, truthy};
use serde_json::{Map, Value};
use std::{io, process::Command};

pub(super) fn render(stores: &Stores, options: &Options, chalk: Chalk) -> io::Result<String> {
    match options.command.as_str() {
        "set" => Ok(chalk.green("added configuration successfully")),
        "del" => Ok(chalk.green("deleted successfully")),
        "get" => Ok(get(stores, &options.values[0])),
        _ => list(stores, options, chalk),
    }
}

fn get(stores: &Stores, key: &str) -> String {
    let combined = stores.combined();
    let value = environment_value(key)
        .map(Value::String)
        .or_else(|| combined.get(key).cloned());
    if value.is_none() && inherited(key) {
        return "undefined".to_owned();
    }
    if let Some(value) = value.filter(|value| !value.is_null()) {
        if !truthy(&value) {
            return String::new();
        }
        // CommandRunner prints the absent result.data for a truthy non-string report.
        return value
            .as_str()
            .unwrap_or("undefined")
            .to_owned();
    }
    if matches!(key, "user.name" | "user.email") { git(key) } else { String::new() }
}

fn git(key: &str) -> String {
    let Ok(output) = Command::new("git")
        .args(["config", "--list"])
        .output()
    else {
        return String::new();
    };
    let text = String::from_utf8_lossy(&output.stdout);
    parse_git_config(&text, key)
}

fn parse_git_config(text: &str, key: &str) -> String {
    text.lines()
        .filter_map(|line| {
            let (entry_key, entry_val) = line.split_once('=')?;
            entry_key
                .trim()
                .eq_ignore_ascii_case(key.trim())
                .then(|| entry_val.to_owned())
        })
        .next_back()
        .unwrap_or_default()
}

fn list(stores: &Stores, options: &Options, chalk: Chalk) -> io::Result<String> {
    let combined = stores.combined();
    if let Some(origin) = &options.origin {
        let store = stores.entries
            .iter()
            .find(|store| store.origin == origin)
            .ok_or_else(|| io::Error::other("config origin is missing"))?;
        return formatted(&store.values, options.json);
    }
    if !options.detailed {
        return formatted(&combined, options.json);
    }
    let mut detailed = Map::new();
    let mut parts = Vec::new();
    for store in &stores.entries {
        detailed.insert(store.origin.to_owned(), Value::Object(store.values.clone()));
        parts.push(format!(
            "{}\n{}",
            chalk.bold(&store.origin.to_uppercase()),
            formatted(&store.values, false)?,
        ));
    }
    if options.json {
        detailed.insert("combined".to_owned(), Value::Object(combined));
        return Ok(serde_json::to_string_pretty(&detailed)?);
    }
    parts.push(format!("{}\n{}", chalk.bold("ALL COMBINED"), formatted(&combined, false)?));
    Ok(parts.join("\n\n"))
}

fn formatted(values: &Map<String, Value>, json: bool) -> io::Result<String> {
    let value =
        bit_workspace_config::jsonc::Node::from_value(&Value::Object(values.clone())).to_value();
    if json {
        return Ok(serde_json::to_string_pretty(&value)?);
    }
    let values = value.as_object().ok_or_else(|| io::Error::other("configuration object"))?;
    Ok(values
        .iter()
        .map(|(key, value)| {
            let padding = 45usize.saturating_sub(key.encode_utf16().count());
            format!("{key}{}{value}", " ".repeat(padding), value = display(value))
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

fn display(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(value) => value.clone(),
        Value::Array(values) => values
            .iter()
            .map(display)
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_owned(),
        _ => value.to_string(),
    }
}

// ConfigGetter indexes a normal JavaScript object, including its inherited Object.prototype.
fn inherited(key: &str) -> bool {
    matches!(
        key,
        "constructor"
            | "__defineGetter__"
            | "__defineSetter__"
            | "hasOwnProperty"
            | "__lookupGetter__"
            | "__lookupSetter__"
            | "isPrototypeOf"
            | "propertyIsEnumerable"
            | "toString"
            | "valueOf"
            | "__proto__"
            | "toLocaleString",
    )
}
