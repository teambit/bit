pub(super) mod finalization;
pub(super) mod snapshot;

pub(super) use bodies::{BodyInput, Prepared, VersionSide, equivalent_dependencies};
pub(super) use status::{Input, SelectionOptions};

mod bodies;
mod status;
#[cfg(test)]
mod tests;
use super::super::invalid;
use serde_json::{Value, json};
use std::io;

pub(super) struct State {
    pub(super) native: crate::merge_transaction::State,
    journal: Value,
}

impl State {
    pub(super) fn new(count: usize) -> io::Result<Self> {
        let mut native = crate::merge_transaction::State::default();
        let journal = crate::merge_transaction::apply(
            "mergeTransactionBegin",
            json!({"mode":"status","count":count,"importMain":false}),
            &mut native,
        )?;
        Ok(Self { native, journal })
    }
    pub(super) fn owner(&self) -> &Value {
        &self.journal["token"]
    }
    pub(super) fn select(&mut self, input: &status::Input<'_>) -> io::Result<Value> {
        let output = status::select(input, &self.owner().clone(), &mut self.native)?;
        self.advance(None)?;
        Ok(output)
    }
    pub(super) fn prepare_bodies(
        &mut self,
        inputs: Vec<Value>,
        snapshots: &crate::workspace::snapshots::State,
        overlay: Option<&crate::command_import::Overlay>,
    ) -> io::Result<Vec<Value>> {
        if self.journal["directive"]["phase"] != "importGap" {
            return Err(invalid("command merge status incomplete"));
        }
        self.advance(Some(inputs.len()))?;
        let mut output = Vec::with_capacity(inputs.len());
        for mut input in inputs {
            input["token"] = self.owner().clone();
            output.push(crate::merge_transaction::prepare_with_overlay(
                input,
                &mut self.native,
                Some(snapshots),
                overlay,
            )?);
        }
        self.advance(None)?;
        self.advance(None)?;
        Ok(output)
    }
    pub(super) fn apply(
        &mut self,
        mut input: Value,
        overlay: Option<&crate::command_import::Overlay>,
    ) -> io::Result<Value> {
        input["token"] = self.owner().clone();
        crate::merge_transaction::apply_with_overlay(&input, &mut self.native, overlay)
    }
    pub(super) fn materialize(&mut self, mut input: Value) -> io::Result<()> {
        input["token"] = self.owner().clone();
        let result = crate::merge_transaction::apply("mergeMaterialize", input, &mut self.native)?;
        if result["failed"] != false || !result["skipped"].as_array().is_some_and(Vec::is_empty) {
            return Err(io::Error::other("command merge materialization failed"));
        }
        Ok(())
    }
    fn advance(&mut self, next: Option<usize>) -> io::Result<()> {
        self.journal = crate::merge_transaction::apply(
            "mergeTransactionReceipt",
            json!({
                "token":self.journal["token"],"revision":self.journal["revision"],
                "phase":self.journal["directive"]["phase"],"index":self.journal["directive"]["index"],
                "completed":self.journal["directive"]["count"],"nextCount":next,
            }),
            &mut self.native,
        )?;
        Ok(())
    }
}
