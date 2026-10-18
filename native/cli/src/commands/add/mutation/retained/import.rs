//! Acknowledge only content preimages consumed by exact native import publications.
#[cfg(test)]
mod tests;

use super::Retained;
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

impl Retained {
    /// A different tracked version needs fresh facts; old proof/spool owners remain retained.
    pub(in crate::commands::add::mutation) fn import_version(
        &mut self,
        identity: &str,
        version: Option<&str>,
    ) {
        let current = self.rows
            .get(identity)
            .and_then(|row| row["version"].as_str())
            .filter(|value| !value.is_empty() && *value != "latest");
        let version = version.filter(|value| !value.is_empty() && *value != "latest");
        if current != version {
            self.rows.remove(identity);
        }
    }

    pub(in crate::commands::add::mutation) fn acknowledge_import(
        &mut self,
        writes: &[Value],
    ) -> io::Result<()> {
        let replacements = self.import_replacements(writes)?;
        for (before, after) in replacements {
            for proof in self.read_set.iter_mut().chain(self.controls.values_mut()) {
                if *proof == before {
                    *proof = after.clone();
                }
            }
        }
        Ok(())
    }
    fn import_replacements(&self, writes: &[Value]) -> io::Result<Vec<(Value, Value)>> {
        let mut seen = HashSet::new();
        let mut replacements = Vec::new();
        for write in writes {
            let (before, after) = receipt(write)?;
            let path = before["path"].as_str().ok_or_else(|| invalid("import write path"))?;
            if !seen.insert(path.to_owned()) {
                return Err(invalid("duplicate import write path"));
            }
            if !self.matching_content(&before)? {
                continue;
            }
            let actual = super::super::controls::refresh(Path::new(path))?;
            if actual != after {
                return Err(invalid("import published content changed"));
            }
            replacements.push((before, after));
        }
        Ok(replacements)
    }
    fn matching_content(&self, before: &Value) -> io::Result<bool> {
        let mut matched = false;
        for proof in self.read_set.iter().chain(self.controls.values()) {
            if proof["path"] != before["path"] || !content(proof) {
                continue;
            }
            if proof != before {
                return Err(invalid("import write preimage changed"));
            }
            matched = true;
        }
        Ok(matched)
    }
}
fn content(proof: &Value) -> bool {
    proof
        .as_object()
        .is_some_and(|proof| {
            proof.len() == 2 && proof.contains_key("path") && proof.contains_key("hash")
        })
}
fn receipt(write: &Value) -> io::Result<(Value, Value)> {
    let row = write.as_object().ok_or_else(|| invalid("import write receipt"))?;
    let path = write["path"]
        .as_str()
        .filter(|path| Path::new(path).is_absolute())
        .ok_or_else(|| invalid("import write path"))?;
    if row.len() != 3
        || !row.contains_key("beforeHash")
        || !row.contains_key("afterHash")
        || !hash(&write["beforeHash"])
        || !hash(&write["afterHash"])
    {
        return Err(invalid("import write digest"));
    }
    Ok((
        json!({"path":path,"hash":write["beforeHash"]}),
        json!({"path":path,"hash":write["afterHash"]}),
    ))
}
fn hash(value: &Value) -> bool {
    value.is_null()
        || value
            .as_str()
            .is_some_and(|hash| {
                hash.len() == 64
                    && hash
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
}
fn invalid(message: &str) -> io::Error {
    io::Error::other(message)
}
