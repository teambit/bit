use super::{Prepared, identity as bitmap_identity, invalid, lane, render_rows, rows};
use serde_json::{Map, Value};
use std::{collections::HashSet, io};

impl Prepared {
    /// `Consumer.updateNextVersionOnBitmap` records a soft tag without moving the current id.
    pub(in crate::workspace::engine::command) fn soft_tag(
        &mut self,
        context: &Value,
        versions: &[(String, String)],
        log: &Value,
        pre_release: Option<&str>,
    ) -> io::Result<()> {
        let bitmap = crate::recovery::jsonc::parse(&self.output)?;
        let mut entries = rows(&bitmap)?;
        let mut seen = HashSet::new();
        for (identity, version) in versions {
            if !seen.insert(identity) || version.is_empty() {
                return Err(invalid("soft tag version"));
            }
            let entry = entries
                .iter_mut()
                .find(|entry| bitmap_identity(entry).ok().as_ref() == Some(identity))
                .ok_or_else(|| invalid("soft tag bitmap identity"))?;
            entry
                .as_object_mut()
                .ok_or_else(|| invalid("soft tag bitmap entry"))?
                .insert("nextVersion".into(), next_version(version, log, pre_release));
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
        for identity in identities {
            let entry = entries
                .iter_mut()
                .find(|entry| bitmap_identity(entry).ok().as_ref() == Some(identity))
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
