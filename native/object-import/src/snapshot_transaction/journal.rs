#[cfg(test)]
#[path = "journal_tests.rs"]
mod tests;

use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, io};

use super::invalid;

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

#[derive(Default)]
pub(super) struct State {
    journals: HashMap<String, Journal>,
}
struct Journal {
    token: String,
    phases: &'static [&'static str],
    phase: usize,
    index: usize,
    count: usize,
    revision: u32,
    terminal: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Begin {
    #[serde(default)]
    soft: bool,
    count: usize,
}
#[derive(Deserialize)]
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
        if self.journals.len() >= 4096 {
            return Err(invalid("snapshot active journal limit"));
        }
        let trimmed = token.trim();
        if trimmed.is_empty() {
            return Err(invalid("snapshot journal token"));
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
    fn kind(&self) -> &str {
        self.phases
            .get(self.phase)
            .copied()
            .unwrap_or("done")
    }
    fn serial(&self) -> bool {
        matches!(self.kind(), "addObjects" | "updateWorkspace")
    }
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
        }
        if self.kind() == "updateWorkspace" && self.index + 1 < self.count {
            self.index += 1;
            self.phase -= 1;
            return;
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
        json!({"token":self.token,"revision":self.revision,"directive":{"kind":self.kind(),"index":self.index,"count":if self.kind()=="done" {0} else {self.expected()}}})
    }
}
fn bound(count: usize) -> io::Result<()> {
    if count > 4096 {
        return Err(invalid("snapshot journal count limit"));
    }
    Ok(())
}
