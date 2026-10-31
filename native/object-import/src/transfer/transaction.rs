#[cfg(test)]
mod tests;

use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

use super::{MAX_OBJECTS, invalid};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Initialize {
    scopes: Vec<String>,
    client_id: String,
    resuming: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Receipt {
    token: String,
    revision: u32,
    success: bool,
}

pub(super) struct Transaction {
    scopes: Vec<String>,
    token: String,
    revision: u32,
    resuming: bool,
    phase: Phase,
}

enum Phase {
    Push(usize),
    Validate,
    Persist(usize, u8),
    Cleanup(Vec<usize>, &'static str),
    Done,
    Failed(&'static str),
}

impl Transaction {
    pub(super) fn initialize(input: Initialize, token: String) -> io::Result<Self> {
        if input.scopes.is_empty()
            || input.scopes.len() > MAX_OBJECTS
            || input.client_id.trim().is_empty()
            || input.client_id.len() > 4096
            || input.client_id.contains(char::is_control)
            || input.scopes
                .iter()
                .any(|scope| {
                    scope.trim().is_empty()
                        || scope.len() > 4096
                        || scope.contains(char::is_control)
                })
        {
            return Err(invalid("unsupported transfer transaction"));
        }
        let phase = if input.resuming { Phase::Validate } else { Phase::Push(0) };
        Ok(Self { scopes: input.scopes, token, revision: 0, resuming: input.resuming, phase })
    }

    pub(super) fn receipt(&mut self, input: &Receipt) -> io::Result<Value> {
        if input.token.trim() != self.token
            || input.revision != self.revision
            || matches!(self.phase, Phase::Done | Phase::Failed(_))
        {
            return Err(invalid("stale transfer receipt"));
        }
        let revision = self.revision
            .checked_add(1)
            .ok_or_else(|| invalid("transfer receipt revision limit"))?;
        self.phase = self.next(input.success);
        self.revision = revision;
        Ok(self.output())
    }

    fn next(&self, success: bool) -> Phase {
        match &self.phase {
            Phase::Push(index) if !success => cleanup((0..*index).collect(), "push"),
            Phase::Push(index) if index + 1 == self.scopes.len() => Phase::Validate,
            Phase::Push(index) => Phase::Push(index + 1),
            Phase::Validate if !success && !self.resuming => {
                cleanup((0..self.scopes.len()).collect(), "validate")
            }
            Phase::Validate if !success => Phase::Failed("validate"),
            Phase::Validate => Phase::Persist(0, 1),
            Phase::Persist(_, 3) if !success => Phase::Failed("persist"),
            Phase::Persist(index, attempt) if !success => Phase::Persist(*index, attempt + 1),
            Phase::Persist(index, _) if index + 1 == self.scopes.len() => Phase::Done,
            Phase::Persist(index, _) => Phase::Persist(index + 1, 1),
            Phase::Cleanup(_, reason) => Phase::Failed(reason),
            Phase::Done => Phase::Done,
            Phase::Failed(reason) => Phase::Failed(reason),
        }
    }

    pub(super) fn output(&self) -> Value {
        let directive = match &self.phase {
            Phase::Push(index) => json!({"kind":"push","indices":[index]}),
            Phase::Validate => {
                json!({"kind":"validate","indices":(0..self.scopes.len()).collect::<Vec<_>>()})
            }
            Phase::Persist(index, attempt) => {
                json!({"kind":"persist","indices":[index],"attempt":attempt})
            }
            Phase::Cleanup(indices, reason) => {
                json!({"kind":"cleanup","indices":indices,"reason":reason})
            }
            Phase::Done => json!({"kind":"done","indices":[]}),
            Phase::Failed(reason) => json!({"kind":"failed","indices":[],"reason":reason}),
        };
        json!({"token":self.token,"revision":self.revision,"directive":directive})
    }
}

fn cleanup(indices: Vec<usize>, reason: &'static str) -> Phase {
    if indices.is_empty() { Phase::Failed(reason) } else { Phase::Cleanup(indices, reason) }
}
