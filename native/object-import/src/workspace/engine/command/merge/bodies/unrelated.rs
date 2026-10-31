use super::{Captured, Conflict, Destinations, Prepared};
use serde_json::{Value, json};

impl Prepared {
    pub(in crate::workspace::engine::command) fn unrelated(
        current: &Captured,
        version: Value,
        files: Vec<Value>,
        relation: Value,
        output: Value,
    ) -> Self {
        Self {
            conflict: Conflict::Unrelated(relation),
            hidden: current.hidden,
            output,
            version,
            version_name: current.target.version.trim().to_owned(),
            files,
            conflict_paths: Vec::new(),
            destinations: Destinations { request: json!({"files":[]}), removals: Vec::new() },
        }
    }
    pub(in crate::workspace::engine::command) fn unrelated_relation(&self) -> Option<&Value> {
        match &self.conflict {
            Conflict::Unrelated(relation) => Some(relation),
            _ => None,
        }
    }
}
