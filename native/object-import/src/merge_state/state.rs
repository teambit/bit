use super::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::io;

#[derive(Default)]
pub(crate) struct State {
    pub(crate) operations: Operations,
    pub(crate) recovery: crate::recovery::State,
    pub(crate) inspection: crate::inspection::State,
    pub(crate) snapshot: crate::snapshot_transaction::State,
    pub(crate) conflict_plan: Option<crate::config_merge::Conflict>,
    entries: Vec<Value>,
    token: Option<String>,
    revision: u32,
}
#[derive(Default)]
pub(crate) struct Operations {
    pub(crate) workspace_reads: crate::workspace::snapshots::State,
    pub(crate) merge_transaction: crate::merge_transaction::State,
    pub(crate) history_query: crate::history_query::State,
    pub(crate) history_reset: crate::history_reset::State,
    pub(crate) checkout_transition: crate::checkout_transition::State,
    pub(crate) transfer: crate::transfer::State,
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
        let self_scope = self.scope
            .as_deref()
            .map(str::trim)
            .filter(|scope| !scope.is_empty());
        identity(entry)
            .is_ok_and(|other| {
                other.name == self.name.trim() && other.scope.as_deref() == self_scope
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
        let token = token.trim();
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
        let entries = crate::parse_jsonc(contents.as_bytes())?;
        if entries.as_array() != Some(&self.entries) {
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
        for id in ids {
            let name = id.name.trim();
            if name.is_empty() || name.len() > 4096 || name.contains('\0') {
                return Err(invalid("invalid unmerged name"));
            }
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
    let mut identity = if let Some(raw) = id.as_str() {
        let raw = raw
            .trim()
            .split('@')
            .next()
            .unwrap_or(raw)
            .trim();
        let (scope, name) = raw
            .split_once('/')
            .map_or((None, raw), |(scope, name)| (Some(scope.to_owned()), name));
        Identity { scope, name: name.to_owned() }
    } else {
        serde_json::from_value(id.clone()).map_err(io::Error::other)?
    };
    identity.name = identity.name.trim().to_owned();
    identity.scope = identity.scope
        .map(|scope| scope.trim().to_owned())
        .filter(|scope| !scope.is_empty());
    if identity.name.is_empty()
        || identity.name.len() > 4096
        || identity.name.contains('\0')
        || identity.scope
            .as_ref()
            .is_some_and(|scope| scope.len() > 4096 || scope.contains('\0'))
    {
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
            .map(str::trim)
            .ok_or_else(|| invalid("missing unmerged head"))?;
        hash(head)?;
        if entry
            .get("laneId")
            .is_none_or(|lane| crate::command_import::lane::parse_lane_id(lane).is_err())
        {
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
