//! Construct [`Prepared`] merge body results for [`Captured`] components with [`Conflict::Unrelated`].

use super::{Captured, Conflict, Destinations, Prepared};
use serde_json::{Value, json};

impl Prepared {
    /// Builds a [`Prepared`] merge result for a component resolved across unrelated histories.
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
    /// Returns the unrelated-history resolution metadata when this merge body used [`Conflict::Unrelated`].
    #[inline]
    pub(in crate::workspace::engine::command) fn unrelated_relation(&self) -> Option<&Value> {
        match &self.conflict {
            Conflict::Unrelated(relation) => Some(relation),
            _ => None,
        }
    }
}

/// Resolves the effective version name for an unrelated-history merge from `current` or `output`.
#[inline]
fn version_name(current: &Captured, output: &Value) -> String {
    Some(current.target.version.trim())
        .filter(|ver| !ver.is_empty())
        .or_else(|| {
            output["id"]
                .as_str()
                .map(str::trim)
                .and_then(|id| id.rsplit_once('@'))
                .map(|(_, ver)| ver.trim())
                .filter(|ver| !ver.is_empty())
        })
        .or_else(|| {
            output["version"]
                .as_str()
                .map(str::trim)
                .filter(|ver| !ver.is_empty())
        })
        .unwrap_or_default()
        .to_owned()
}
