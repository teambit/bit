//! Phase-ordered execution journal ([`FULL`], [`SOFT`]) for full-snap, soft-tag, and repository-persist transactions.

#[cfg(test)]
#[path = "journal_tests.rs"]
mod tests;

use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, io};

use super::invalid;

/// Ordered phase sequence required for a full snap/tag transaction (`snapshotTransactionBegin`).
const FULL: &[&str] = &[
    "initialize",
    "preSnap",
    "prepareVersions",
    "captureLane",
    "flattenDependencies",
    "addObjects",
    "updateWorkspace",
    "stagedWrite",
    "hydrateBuild",
    "removeWorkspace",
    "addLane",
    "persist",
    "mergeConfigCleanup",
    "linkWorkspace",
    "clearCache",
];
/// Ordered phase sequence required for a soft-tag transaction (`snapshotTransactionBegin` with `soft: true`).
const SOFT: &[&str] = &["initialize", "preSnap", "prepareVersions", "captureLane", "softTag"];
const REPOSITORY: &[&str] = &[
    "deleteObjects",
    "validateObjects",
    "writeObjects",
    "writeIndex",
    "remoteLanesWrite",
    "unmergedWrite",
    "clearObjects",
    "postPersist",
];

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct State {
    journals: HashMap<String, Journal>,
}
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct Journal {
    token: String,
    phases: &'static [&'static str],
    phase: usize,
    index: usize,
    count: usize,
    revision: u32,
    terminal: bool,
}
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Begin {
    #[serde(default)]
    soft: bool,
    count: usize,
}
#[derive(Debug, Default, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Receipt {
    token: String,
    revision: u32,
    completed: usize,
    failed: bool,
    next_count: Option<usize>,
}
impl State {
    pub(super) fn begin(
        &mut self,
        input: Value,
        token: String,
        repository: bool,
    ) -> io::Result<Value> {
        let request: Begin = serde_json::from_value(input).map_err(io::Error::other)?;
        bound(request.count)?;
        let trimmed = token.trim();
        if trimmed.is_empty() || trimmed.len() > 256 || trimmed.contains('\0') {
            return Err(invalid("snapshot journal token"));
        }
        if self.journals.len() >= 4096 || self.journals.contains_key(trimmed) {
            return Err(invalid("snapshot active journal limit"));
        }
        let token = if trimmed.len() == token.len() { token } else { trimmed.to_owned() };
        let phases = if repository {
            REPOSITORY
        } else if request.soft {
            SOFT
        } else {
            FULL
        };
        let journal = Journal {
            token,
            phases,
            phase: 0,
            index: 0,
            count: request.count,
            revision: 0,
            terminal: false,
        };
        let output = journal.output();
        self.journals.insert(journal.token.clone(), journal);
        Ok(output)
    }
    pub(super) fn receipt(&mut self, input: Value) -> io::Result<Value> {
        let request: Receipt = serde_json::from_value(input).map_err(io::Error::other)?;
        let token = request.token.trim();
        if token.is_empty() || token.len() > 256 || token.contains('\0') {
            return Err(invalid("missing snapshot journal"));
        }
        let journal =
            self.journals.get_mut(token).ok_or_else(|| invalid("missing snapshot journal"))?;
        journal.verify(&request)?;
        journal.revision = journal.revision
            .checked_add(1)
            .ok_or_else(|| invalid("snapshot journal revision limit"))?;
        let output = if request.failed {
            journal.terminal = true;
            json!({"token":journal.token,"revision":journal.revision,"directive":{"kind":"failed","phase":journal.kind(),"index":journal.index,"completed":request.completed}})
        } else {
            journal.advance(request.next_count);
            journal.output()
        };
        if journal.terminal || journal.kind() == "done" {
            self.journals.remove(token);
        }
        Ok(output)
    }
}
impl Journal {
    #[inline]
    fn kind(&self) -> &str {
        self.phases
            .get(self.phase)
            .copied()
            .unwrap_or("done")
    }
    #[inline]
    fn serial(&self) -> bool {
        matches!(self.kind(), "addObjects" | "updateWorkspace")
    }
    #[inline]
    fn expected(&self) -> usize {
        if self.serial() || self.phases != REPOSITORY { 1 } else { self.count }
    }
    fn verify(&self, request: &Receipt) -> io::Result<()> {
        if self.terminal
            || self.kind() == "done"
            || request.token.trim() != self.token
            || request.revision != self.revision
        {
            return Err(invalid("stale snapshot journal receipt"));
        }
        if request.completed > self.expected()
            || (!request.failed && request.completed != self.expected())
        {
            return Err(invalid("stale or invalid snapshot journal receipt"));
        }
        if let Some(count) = request.next_count {
            bound(count)?;
        }
        Ok(())
    }
    fn advance(&mut self, next_count: Option<usize>) {
        if self.kind() == "updateWorkspace" {
            self.count = next_count.unwrap_or(self.count);
            if self.index + 1 < self.count {
                self.index += 1;
                self.phase -= 1;
                return;
            }
        }
        self.phase += 1;
        if self.kind() != "updateWorkspace" {
            self.index = 0;
        }
        if !self.serial() || (self.kind() == "addObjects" && self.index == 0) {
            self.count = next_count.unwrap_or(self.count);
        }
        if self.kind() == "addObjects" && self.count == 0 {
            self.phase += 2;
        }
    }
    fn output(&self) -> Value {
        let kind = self.kind();
        json!({"token":self.token,"revision":self.revision,"directive":{"kind":kind,"index":self.index,"count":if kind=="done" {0} else {self.expected()}}})
    }
}
#[inline]
fn bound(count: usize) -> io::Result<()> {
    if count > 4096 {
        return Err(invalid("snapshot journal count limit"));
    }
    Ok(())
}
