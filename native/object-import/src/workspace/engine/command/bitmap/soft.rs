use super::{Prepared, invalid, lane, render_rows};
use serde_json::{Map, Value};
use std::{collections::HashSet, io};

pub(super) fn rows(bitmap: &Value) -> io::Result<Vec<Value>> {
    let entries = bitmap.as_object().ok_or_else(|| invalid("command bitmap object"))?;
    if bitmap["$schema-version"].as_str().is_none() {
        return Err(invalid("command bitmap schema requires canonical migration"));
    }
    entries
        .iter()
        .filter(|(key, _)| {
            !key.starts_with('$') && !matches!(key.as_str(), "_bit_lane" | "version")
        })
        .map(|(key, entry)| normalized_row(key, entry))
        .collect()
}

fn normalized_row(key: &str, entry: &Value) -> io::Result<Value> {
    if entry
        .get("name")
        .is_some_and(|val| !val.is_string() && !val.is_null())
    {
        return Err(invalid("command bitmap component name"));
    }
    let (scope, name) = crate::reset_lane::bitmap::row_identity(key, entry);
    if name.is_empty() {
        return Err(invalid("command bitmap component name"));
    }
    let mut cloned = entry.clone();
    let map = cloned.as_object_mut().ok_or_else(|| invalid("command bitmap entry"))?;
    if map
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .is_empty()
    {
        map.insert("name".into(), Value::String(name.to_owned()));
    }
    if map.get("scope").is_none()
        && map.get("defaultScope").is_none()
        && let Some(scope) = scope.filter(|scope| !scope.is_empty())
    {
        map.insert("scope".into(), Value::String(scope.to_owned()));
    }
    Ok(cloned)
}

pub(super) fn identity(entry: &Value) -> io::Result<String> {
    let name = entry["name"]
        .as_str()
        .filter(|nm| !nm.is_empty())
        .ok_or_else(|| invalid("command bitmap name"))?;
    let scope = entry["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            entry["defaultScope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
        })
        .ok_or_else(|| invalid("command bitmap scope"))?;
    Ok(format!("{scope}/{name}"))
}

impl Prepared {
    /// `Consumer.updateNextVersionOnBitmap` records a soft tag without moving the current id.
    pub(in crate::workspace::engine::command) fn soft_tag(
        &mut self,
        context: &Value,
        versions: &[(String, String)],
        log: &Value,
        component_logs: &Value,
        pre_release: Option<&str>,
    ) -> io::Result<()> {
        let bitmap = crate::recovery::jsonc::parse(&self.output)?;
        let mut entries = rows(&bitmap)?;
        let mut seen = HashSet::new();
        for (id, version) in versions {
            if !seen.insert(id) || version.is_empty() {
                return Err(invalid("soft tag version"));
            }
            let entry = entries
                .iter_mut()
                .find(|entry| identity(entry).ok().as_ref() == Some(id))
                .ok_or_else(|| invalid("soft tag bitmap identity"))?;
            entry
                .as_object_mut()
                .ok_or_else(|| invalid("soft tag bitmap entry"))?
                .insert(
                    "nextVersion".into(),
                    next_version(version, component_logs.get(id).unwrap_or(log), pre_release),
                );
        }
        self.output =
            render_rows(entries, &bitmap["$schema-version"], lane::header(context, &bitmap)?)?;
        self.changed = self.output != self.original;
        Ok(())
    }
    /// Persisting a soft tag clears its pending bitmap marker with the version update.
    pub(in crate::workspace::engine::command) fn clear_next_versions(
        &mut self,
        context: &Value,
        identities: &[String],
    ) -> io::Result<()> {
        let bitmap = crate::recovery::jsonc::parse(&self.output)?;
        let mut entries = rows(&bitmap)?;
        for id in identities {
            let entry = entries
                .iter_mut()
                .find(|entry| identity(entry).ok().as_ref() == Some(id))
                .ok_or_else(|| invalid("tag persist bitmap identity"))?;
            entry
                .as_object_mut()
                .ok_or_else(|| invalid("tag persist bitmap entry"))?
                .shift_remove("nextVersion");
        }
        self.output =
            render_rows(entries, &bitmap["$schema-version"], lane::header(context, &bitmap)?)?;
        self.changed = self.output != self.original;
        Ok(())
    }
}

fn next_version(version: &str, log: &Value, pre_release: Option<&str>) -> Value {
    let mut next = Map::new();
    next.insert("version".into(), Value::String(version.to_owned()));
    for field in ["message", "username", "email"] {
        if let Some(value) = log.get(field) {
            next.insert(field.into(), value.clone());
        }
    }
    if let Some(pre_release) = pre_release {
        next.insert("preRelease".into(), Value::String(pre_release.to_owned()));
    }
    Value::Object(next)
}
