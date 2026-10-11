use super::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::io;

#[derive(Default)]
pub(crate) struct State {
    entries: Vec<Value>,
    token: Option<String>,
    revision: u32,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum Action {
    Add { entry: Value },
    Remove { ids: Vec<Identity> },
    RemoveAll,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Identity {
    scope: Option<String>,
    name: String,
}
impl Identity {
    fn matches(&self, entry: &Value) -> bool {
        entry
            .get("id")
            .is_some_and(|id| {
                id.get("name").and_then(Value::as_str) == Some(self.name.as_str())
                    && id.get("scope").and_then(Value::as_str) == self.scope.as_deref()
            })
    }
}
impl State {
    pub(super) fn initialize(&mut self, entries: Vec<Value>, bytes: &[u8]) -> io::Result<Value> {
        validate(&entries)?;
        self.entries = entries;
        self.token = Some(digest(bytes));
        self.revision = 0;
        Ok(self.identity())
    }
    pub(super) fn verify(&self, token: &str, revision: u32) -> io::Result<()> {
        hash(token)?;
        if self.token.as_deref() != Some(token) || self.revision != revision {
            return Err(invalid("stale merge state"));
        }
        Ok(())
    }
    pub(super) fn transition(&mut self, action: Action, bytes: &[u8]) -> io::Result<Value> {
        let (indices, added, changed) = self.selection(&action)?;
        let mut entries: Vec<_> = indices
            .iter()
            .map(|index| self.entries[*index].clone())
            .collect();
        if let Action::Add { entry } = action {
            entries.push(entry);
        }
        validate(&entries)?;
        let revision =
            self.revision.checked_add(1).ok_or_else(|| invalid("state revision limit"))?;
        let token = next_token(self.token.as_deref(), bytes);
        self.entries = entries;
        self.token = Some(token);
        self.revision = revision;
        let mut output = self.identity();
        output["indices"] = json!(indices);
        output["added"] = json!(added);
        output["changed"] = json!(changed);
        Ok(output)
    }
    pub(super) fn contents(&self, contents: &str) -> io::Result<()> {
        let entries: Vec<Value> = serde_json::from_str(contents).map_err(io::Error::other)?;
        if entries != self.entries {
            return Err(invalid("merge commit does not match native state"));
        }
        Ok(())
    }
    fn identity(&self) -> Value {
        json!({"token":self.token,"revision":self.revision})
    }
    fn selection(&self, action: &Action) -> io::Result<(Vec<usize>, bool, bool)> {
        match action {
            Action::Add { entry } => {
                let identity = identity(entry)?;
                if self.entries
                    .iter()
                    .any(|existing| identity.matches(existing))
                {
                    return Err(invalid("duplicate unmerged component"));
                }
                Ok(((0..self.entries.len()).collect(), true, true))
            }
            Action::Remove { ids } => self.remove(ids),
            Action::RemoveAll => Ok((Vec::new(), false, true)),
        }
    }
    fn remove(&self, ids: &[Identity]) -> io::Result<(Vec<usize>, bool, bool)> {
        if ids.len() > 4096 {
            return Err(invalid("merge removal count limit"));
        }
        let removed: Vec<_> = ids
            .iter()
            .filter_map(|id| {
                self.entries
                    .iter()
                    .position(|entry| id.matches(entry))
            })
            .collect();
        let retained = (0..self.entries.len())
            .filter(|index| !removed.contains(index))
            .collect();
        Ok((retained, false, !removed.is_empty()))
    }
}
fn identity(entry: &Value) -> io::Result<Identity> {
    let id = entry.get("id").ok_or_else(|| invalid("missing unmerged identity"))?;
    let identity: Identity = serde_json::from_value(id.clone()).map_err(io::Error::other)?;
    if identity.name.is_empty() || identity.name.contains('\0') {
        return Err(invalid("invalid unmerged name"));
    }
    Ok(identity)
}
fn validate(entries: &[Value]) -> io::Result<()> {
    if entries.len() > 4096
        || serde_json::to_vec(entries).map_err(io::Error::other)?.len() > super::MAX_JSON
    {
        return Err(invalid("merge state budget"));
    }
    for entry in entries {
        identity(entry)?;
        let head = entry
            .get("head")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("missing unmerged head"))?;
        hash(head)?;
        if !entry.get("laneId").is_some_and(Value::is_object) {
            return Err(invalid("invalid unmerged lane"));
        }
    }
    Ok(())
}
fn digest(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}
fn next_token(previous: Option<&str>, bytes: &[u8]) -> String {
    let mut hash = Sha1::new();
    hash.update(previous.unwrap_or_default().as_bytes());
    hash.update(bytes);
    crate::validate::hexadecimal(&hash.finalize())
}
