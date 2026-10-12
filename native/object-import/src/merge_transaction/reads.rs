use super::invalid;
use crate::checkout::repository::SourceRecord;
use serde_json::{Value, json};
use std::{cell::RefCell, collections::HashMap, io};
thread_local! {static ACTIVE: RefCell<Option<Trace>> = const {RefCell::new(None)};}
#[derive(Default)]
pub(super) struct Trace {
    pub(super) records: HashMap<String, SourceRecord>,
    source_reads: usize,
    source_bytes: usize,
    compressed: usize,
}
pub(super) struct Scope {
    previous: Option<Trace>,
    finished: bool,
}
impl Scope {
    pub(super) fn begin() -> Self {
        Self {
            previous: ACTIVE.with(|active| active.replace(Some(Trace::default()))),
            finished: false,
        }
    }
    pub(super) fn finish(mut self) -> Trace {
        let trace = ACTIVE
            .with(|active| active.replace(self.previous.take()))
            .expect("merge read scope");
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
    ACTIVE.with(|active| {
        let mut active = active.borrow_mut();
        let Some(trace) = active.as_mut() else {
            return Ok(());
        };
        trace.source_reads += 1;
        trace.source_bytes += record.body.len();
        let hash = crate::validate::hexadecimal(&hash);
        if !trace.records.contains_key(&hash) {
            trace.compressed += record.compressed.len();
            if trace.compressed > 32 * 1024 * 1024 || trace.records.len() >= 4096 {
                return Err(invalid("merge Source receipt budget"));
            }
            trace.records.insert(hash, record.clone());
        }
        Ok(())
    })
}
