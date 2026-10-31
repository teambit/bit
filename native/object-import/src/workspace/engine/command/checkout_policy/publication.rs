//! Plan workspace.jsonc bytes before the checkout writes component sources.

use super::{RESOLVER, invalid};
use serde_json::{Map, Value, json};
use std::{fs, io, path::PathBuf};

const MAX_BYTES: usize = 32 * 1024 * 1024;

pub(super) struct Prepared {
    path: PathBuf,
    before: Vec<u8>,
    after: Option<String>,
}

impl Prepared {
    pub(super) fn new(path: PathBuf) -> io::Result<Self> {
        ordinary(&path)?;
        let before = fs::read(&path)?;
        if before.len() > MAX_BYTES {
            return Err(invalid("command workspace config budget"));
        }
        crate::recovery::jsonc::parse(&before)?;
        Ok(Self { path, before, after: None })
    }

    pub(super) fn prepare(&mut self, plan: &Value) -> io::Result<Option<Value>> {
        let updates =
            plan["updates"].as_array().ok_or_else(|| invalid("command policy updates"))?;
        let conflicts =
            plan["conflicts"].as_object().ok_or_else(|| invalid("command policy conflicts"))?;
        let logs = plan["logs"].as_array().ok_or_else(|| invalid("command policy logs"))?;
        if plan["hasDeps"] != true {
            if !updates.is_empty() || !conflicts.is_empty() {
                return Err(invalid("command policy empty dependency result"));
            }
            return Ok(None);
        }
        let mapped = update_map(updates)?;
        let original = String::from_utf8(self.before.clone())
            .map_err(|_| invalid("command workspace config UTF-8"))?;
        let mut text = if mapped.is_empty() {
            original
        } else {
            render_updates_kind(&original, &mapped, cfg!(windows), plan["merge"] != true)?
        };
        if !conflicts.is_empty() {
            text = crate::config_merge::render_workspace_conflict(&text, &plan["conflicts"])?;
        }
        if text.as_bytes() != self.before {
            self.after = Some(text);
        }
        Ok(Some(report(logs, mapped, conflicts)))
    }

    pub(super) fn validate(&self) -> io::Result<()> {
        ordinary(&self.path)?;
        if fs::read(&self.path)? != self.before {
            return Err(invalid("command workspace config changed"));
        }
        if self.after.is_some() {
            crate::merge_state::write::validate_existing(&self.path)?;
        }
        Ok(())
    }

    pub(super) fn commit(&self) -> io::Result<()> {
        let Some(after) = &self.after else { return Ok(()) };
        self.validate()?;
        crate::merge_state::write::commit(&self.path, after)
    }
}

fn update_map(updates: &[Value]) -> io::Result<Map<String, Value>> {
    let mut mapped = Map::new();
    for update in updates {
        let row = update
            .as_array()
            .filter(|row| row.len() == 3)
            .ok_or_else(|| invalid("command workspace policy update row"))?;
        let name = row[0].as_str().ok_or_else(|| invalid("command policy name"))?;
        let before = row[1].as_str().ok_or_else(|| invalid("command policy old version"))?;
        let after = row[2].as_str().ok_or_else(|| invalid("command policy new version"))?;
        if mapped
            .insert(name.to_owned(), json!([before, after]))
            .is_some()
        {
            return Err(invalid("command duplicate workspace policy update"));
        }
    }
    Ok(mapped)
}

fn report(logs: &[Value], mapped: Map<String, Value>, conflicts: &Map<String, Value>) -> Value {
    let mut report = json!({"logs":logs});
    if !mapped.is_empty() {
        report["workspaceDepsUpdates"] = Value::Object(mapped);
    }
    if !conflicts.is_empty() {
        report["workspaceDepsConflicts"] = Value::Object(conflicts.clone());
    }
    report
}

fn ordinary(path: &PathBuf) -> io::Result<()> {
    if !path.is_absolute() || !fs::symlink_metadata(path)?.is_file() {
        return Err(invalid("command workspace config path"));
    }
    Ok(())
}

fn resolver_key(document: &crate::jsonc::Document) -> String {
    document
        .value()
        .as_object()
        .and_then(|map| {
            map.keys()
                .find(|key| key.as_str() == RESOLVER || key.starts_with(&format!("{RESOLVER}@")))
        })
        .cloned()
        .unwrap_or_else(|| RESOLVER.to_owned())
}

fn render_updates_kind(
    original: &str,
    updates: &Map<String, Value>,
    windows: bool,
    defaults: bool,
) -> io::Result<String> {
    let mut document = crate::jsonc::Document::parse(original)?;
    let key = resolver_key(&document);
    if !document
        .get(&[&key])
        .is_some_and(|value| value.is_object())
        || !document
            .get(&[&key, "policy"])
            .is_some_and(|value| value.is_object())
    {
        return Err(invalid("command workspace policy fields"));
    }
    for (name, pair) in updates {
        update_one(&mut document, &key, name, pair)?;
    }
    for (path, value) in [
        (vec![key.as_str(), "policy", "peerDependencies"], json!({})),
        (vec![key.as_str(), "linkCoreAspects"], json!(true)),
    ] {
        if defaults && document.get(&path).is_none() {
            document.set(&path, &value);
        }
    }
    // WorkspaceConfig.toVinyl delegates the serialized JSONC to AbstractVinyl,
    // whose write applies platform EOLs; comment-json itself always renders LF.
    let bytes = crate::checkout::eol::normalize(format!("{document}\n").into_bytes(), windows);
    let output = String::from_utf8(bytes).map_err(io::Error::other)?;
    if output.len() > MAX_BYTES {
        return Err(invalid("command workspace config output budget"));
    }
    Ok(output)
}

fn update_one(
    document: &mut crate::jsonc::Document,
    resolver_key: &str,
    name: &str,
    pair: &Value,
) -> io::Result<()> {
    let old = pair[0].as_str().ok_or_else(|| invalid("command policy old value"))?;
    let new = pair[1].as_str().ok_or_else(|| invalid("command policy new value"))?;
    let mut found = 0;
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        let mut path = vec![resolver_key, "policy", field, name];
        let Some(entry) = document.get(&path) else { continue };
        if !entry.is_string() {
            path.push("version");
        }
        let version =
            document.get(&path).ok_or_else(|| invalid("command policy object version"))?;
        if version.as_str() != Some(old) {
            return Err(invalid("command workspace policy old version changed"));
        }
        document.set(&path, &json!(new));
        found += 1;
    }
    if found != 1 {
        return Err(invalid("command workspace policy ownership"));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
