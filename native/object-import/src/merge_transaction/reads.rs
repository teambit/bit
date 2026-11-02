//! Thread-local `Source` object read tracing ([`Trace`], [`Receipt`], [`Scope`], [`source`], [`source_parts`]) and byte-budget accounting for merge transactions.

use super::invalid;
use crate::checkout::repository::SourceRecord;
use serde_json::{Value, json};
use std::{cell::RefCell, collections::HashMap, io};
thread_local! {static ACTIVE: RefCell<Option<Trace>> = const {RefCell::new(None)};}
/// Thread-local accumulator of `Source` object read receipts and byte budgets during merge prep.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Trace {
    pub(super) records: HashMap<String, Receipt>,
    source_reads: usize,
    source_bytes: usize,
    compressed: usize,
    retained_bytes: usize,
}
/// Recorded `Source` object body and compressed/inflated byte sizes from a single read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Receipt {
    pub(super) body: Vec<u8>,
    pub(super) compressed_size: usize,
    pub(super) inflated_size: usize,
}
/// RAII guard installing a thread-local [`Trace`] and restoring the previous trace on drop.
#[derive(Debug)]
pub(super) struct Scope {
    previous: Option<Trace>,
    finished: bool,
}
impl Scope {
    /// Installs a fresh thread-local [`Trace`] and returns a guard that restores the prior trace.
    pub(super) fn begin() -> Self {
        Self {
            previous: ACTIVE.with(|active| active.replace(Some(Trace::default()))),
            finished: false,
        }
    }
    /// Restores the previous thread-local [`Trace`] and returns the finished [`Trace`] for this scope.
    pub(super) fn finish(mut self) -> Trace {
        let trace = ACTIVE
            .with(|active| active.replace(self.previous.take()))
            .unwrap_or_default();
        self.finished = true;
        trace
    }
}
impl Drop for Scope {
    fn drop(&mut self) {
        if !self.finished {
            ACTIVE.with(|active| {
                active.replace(self.previous.take());
            });
        }
    }
}
impl Trace {
    pub(super) fn stats(&self) -> Value {
        json!({"sourceReads":self.source_reads,"sourceBodyBytes":self.source_bytes})
    }
}
pub(crate) fn source(hash: [u8; 20], record: &SourceRecord) -> io::Result<()> {
    source_parts(hash, &record.body, record.compressed.len(), record.inflated_size)
}
pub(crate) fn source_parts(
    hash: [u8; 20],
    body: &[u8],
    compressed_size: usize,
    inflated_size: usize,
) -> io::Result<()> {
    ACTIVE.with(|active| {
        let mut active = active.borrow_mut();
        let Some(trace) = active.as_mut() else {
            return Ok(());
        };
        record_source_trace(trace, hash, body, compressed_size, inflated_size)
    })
}
fn record_source_trace(
    trace: &mut Trace,
    hash: [u8; 20],
    body: &[u8],
    compressed_size: usize,
    inflated_size: usize,
) -> io::Result<()> {
    trace.source_reads = trace.source_reads.saturating_add(1);
    trace.source_bytes = trace.source_bytes.saturating_add(body.len());
    let count = trace.records.len();
    let entry = match trace.records.entry(crate::validate::hexadecimal(&hash)) {
        std::collections::hash_map::Entry::Occupied(existing) => {
            if existing.get().body != body {
                return Err(invalid("merge Source receipt mismatch"));
            }
            return Ok(());
        }
        std::collections::hash_map::Entry::Vacant(vacant) => vacant,
    };
    if inflated_size < body.len() || count >= 4096 {
        return Err(invalid("merge Source receipt budget"));
    }
    trace.compressed = trace.compressed.saturating_add(compressed_size);
    trace.retained_bytes = trace.retained_bytes.saturating_add(body.len());
    if trace.compressed > 32 * 1024 * 1024 || trace.retained_bytes > 32 * 1024 * 1024 {
        return Err(invalid("merge Source receipt budget"));
    }
    entry.insert(Receipt { body: body.to_vec(), compressed_size, inflated_size });
    Ok(())
}
