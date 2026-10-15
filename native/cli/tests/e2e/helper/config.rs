//! The `workspace.jsonc` and `scope.json` edits of `e2e-workspace-jsonc-helper.ts` and
//! `e2e-setup-template.ts`.

use serde_json::{Map, Value};
use std::{fs, path::Path};

/// `workspace.jsonc` without its comments. The rewrite drops them, as the comments carry
/// nothing a command reads.
pub fn read_jsonc(path: &Path) -> Value {
    let text = fs::read_to_string(path).unwrap();
    serde_json::from_str(&strip_comments(&text)).unwrap()
}

pub fn write_json(path: &Path, value: &Value, indent: &[u8]) {
    let mut out = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(indent);
    let mut serializer = serde_json::Serializer::with_formatter(&mut out, formatter);
    serde::Serialize::serialize(value, &mut serializer).unwrap();
    fs::write(path, out).unwrap();
}

/// `addKeyVal`: `key` at the root of `workspace.jsonc`.
pub fn set_workspace_key(root: &Path, key: &str, value: Value) {
    let path = root.join("workspace.jsonc");
    let mut config = read_jsonc(&path);
    config
        .as_object_mut()
        .unwrap()
        .insert(key.to_string(), value);
    write_json(&path, &config, b"  ");
}

/// `addKeyValToWorkspace`: `key` in the `teambit.workspace/workspace` entry.
pub fn set_workspace_aspect_key(root: &Path, key: &str, value: Value) {
    let path = root.join("workspace.jsonc");
    let mut config = read_jsonc(&path);
    let workspace = config
        .as_object_mut()
        .unwrap()
        .entry("teambit.workspace/workspace")
        .or_insert_with(|| Value::Object(Map::new()));
    workspace
        .as_object_mut()
        .unwrap()
        .insert(key.to_string(), value);
    write_json(&path, &config, b"  ");
}

/// `ScopeJson.toJson()`: four spaces, no trailing newline.
pub fn update_scope_json(path: &Path, update: impl FnOnce(&mut Map<String, Value>)) {
    let mut scope: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    update(scope.as_object_mut().unwrap());
    write_json(path, &scope, b"    ");
}

/// `//` and `/* */` comments outside strings removed.
fn strip_comments(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    let mut in_string = false;
    while let Some(char) = chars.next() {
        if in_string {
            out.push(char);
            if char == '\\' {
                out.extend(chars.next());
            } else if char == '"' {
                in_string = false;
            }
            continue;
        }
        match (char, chars.peek()) {
            ('/', Some('/')) => skip_line(&mut chars),
            ('/', Some('*')) => skip_block(&mut chars),
            _ => {
                in_string = char == '"';
                out.push(char);
            }
        }
    }
    out
}

fn skip_line(chars: &mut impl Iterator<Item = char>) {
    for char in chars.by_ref() {
        if char == '\n' {
            break;
        }
    }
}

fn skip_block(chars: &mut std::iter::Peekable<std::str::Chars<'_>>) {
    chars.next();
    while let Some(char) = chars.next() {
        if char == '*' && chars.peek() == Some(&'/') {
            chars.next();
            break;
        }
    }
}
