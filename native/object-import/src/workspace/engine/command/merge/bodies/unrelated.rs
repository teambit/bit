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
        let version_name = version_name(current, &output);
        Self {
            conflict: Conflict::Unrelated(relation),
            hidden: current.hidden,
            output,
            version,
            version_name,
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

fn version_name(current: &Captured, output: &Value) -> String {
    let trimmed = current.target.version.trim();
    if !trimmed.is_empty() {
        return trimmed.to_owned();
    }
    output["id"]
        .as_str()
        .and_then(|id| id.rsplit_once('@'))
        .map_or("", |(_, ver)| ver.trim())
        .to_owned()
}
