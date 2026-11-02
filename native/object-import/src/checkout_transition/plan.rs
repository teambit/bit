//! Prepared checkout [`Plan`] state ([`State`]), body spooling, and token lifecycle management.

use super::{invalid, wire};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::HashMap,
    fs::OpenOptions,
    io::{self, Write},
    path::PathBuf,
};
/// Active checkout plans keyed by token alongside a monotonic sequence counter.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct State {
    /// Retained [`Plan`] entries keyed by their hex checkout token.
    pub(super) plans: HashMap<String, Plan>,
    /// Monotonic counter used to mint unique checkout plan tokens.
    sequence: u64,
}
/// Prepared checkout plan holding spooled bodies, target manifests, current snapshots, and merge rows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Plan {
    pub(super) bodies: Vec<Body>,
    pub(super) target: Vec<wire::Manifest>,
    pub(super) target_indices: Vec<usize>,
    pub(super) current: Vec<Current>,
    pub(super) merge_rows: Vec<Value>,
    pub(super) has_conflicts: bool,
    pub(super) statuses: Vec<Value>,
    pub(super) other: Option<Vec<wire::Manifest>>,
}
/// Tracked current workspace file metadata and its associated [`Body`] plan index.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Current {
    pub(super) relative_path: String,
    pub(super) path: PathBuf,
    pub(super) protected: bool,
    pub(super) plan_index: usize,
    pub(super) shares_buffer: bool,
    pub(super) raw_hash: String,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Body {
    pub(super) offset: Option<usize>,
    pub(super) contents: Vec<u8>,
    pub(super) path: PathBuf,
    pub(super) hash: String,
}
impl Body {
    #[inline]
    pub(super) fn new(contents: Vec<u8>) -> Self {
        let hash = crate::validate::hexadecimal(&Sha1::digest(&contents));
        Self { contents, path: PathBuf::new(), hash, offset: None }
    }
    #[inline]
    pub(super) fn manifest(&self, index: usize) -> Value {
        let mut row = json!({"planIndex":index,"spoolPath":self.path,"spoolHash":self.hash,"bytes":self.contents.len()});
        if let Some(offset) = self.offset {
            row["spoolOffset"] = json!(offset);
        }
        row
    }
    #[inline]
    pub(super) fn spool(&self) -> io::Result<()> {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&self.path)?
            .write_all(&self.contents)
    }
}
impl Plan {
    #[inline]
    pub(super) fn bytes(&self) -> usize {
        self.bodies
            .iter()
            .map(|body| body.contents.len())
            .fold(0_usize, usize::saturating_add)
    }
    pub(super) fn manifest(&self, token: &str) -> Value {
        let target = self.target
            .iter()
            .enumerate()
            .map(|(index, file)| {
                let plan_index = self.target_indices[index];
                let mut row = self.bodies[plan_index].manifest(plan_index);
                row["index"] = json!(index);
                row["relativePath"] = json!(file.relative_path.trim());
                row["hash"] = json!(file.hash.trim());
                row
            })
            .collect::<Vec<_>>();
        json!({"token":token,"count":self.bodies.len(),"hasConflicts":self.has_conflicts,"targetFiles":target,"bodies":self.bodies.iter().enumerate().map(|(index,body)|body.manifest(index)).collect::<Vec<_>>(),"mergeRows":self.merge_rows,"statuses":self.statuses,"removals":[],"currentFiles":self.current.iter().enumerate().map(|(index,file)|{let mut row=self.bodies[file.plan_index].manifest(file.plan_index);row["index"]=json!(index);row["relativePath"]=json!(file.relative_path.trim());row["currentHash"]=json!(self.bodies[file.plan_index].hash);row["sharesCurrent"]=json!(file.shares_buffer);row["protected"]=json!(file.protected);row}).collect::<Vec<_>>()})
    }
}
impl State {
    #[inline]
    pub(super) fn retained_totals(&self) -> (usize, usize) {
        self.plans
            .values()
            .fold((0_usize, 0_usize), |(bytes, bodies), existing| {
                (
                    bytes.saturating_add(existing.bytes()),
                    bodies.saturating_add(existing.bodies.len()),
                )
            })
    }

    pub(super) fn retain(
        &mut self,
        mut plan: Plan,
        input: &Value,
        directory: &std::path::Path,
    ) -> io::Result<Value> {
        let (retained, count) = self.retained_totals();
        if retained.saturating_add(plan.bytes()) > 32 * 1024 * 1024
            || count.saturating_add(plan.bodies.len()) > 4096
            || self.plans.len() >= 4096
        {
            return Err(invalid("checkout retained plan budget"));
        }
        let sequence = self.sequence
            .checked_add(1)
            .ok_or_else(|| invalid("checkout plan sequence overflow"))?;
        let mut digest = Sha1::new();
        digest.update(sequence.to_be_bytes());
        serde_json::to_writer(&mut digest, input).map_err(io::Error::other)?;
        let token = crate::validate::hexadecimal(&digest.finalize());
        let directory: PathBuf = directory.components().collect();
        for (index, body) in plan.bodies.iter_mut().enumerate() {
            body.path = directory.join(format!("{token}-{index}.checkout"));
        }
        if input["packedBodies"] == true {
            super::spool::assign(&mut plan.bodies, &directory, &token, 0);
        }
        let output = plan.manifest(&token);
        if serialized_len(&output)? > 4 * 1024 * 1024 {
            return Err(invalid("checkout manifest output limit"));
        }
        super::spool::write(&plan.bodies)?;
        self.sequence = sequence;
        self.plans.insert(token, plan);
        Ok(output)
    }
}

#[inline]
fn serialized_len(value: &Value) -> io::Result<usize> {
    struct ByteCount(usize);
    impl std::io::Write for ByteCount {
        #[inline]
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0 = self.0.saturating_add(buf.len());
            Ok(buf.len())
        }
        #[inline]
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    let mut counter = ByteCount(0);
    serde_json::to_writer(&mut counter, value).map_err(io::Error::other)?;
    Ok(counter.0)
}
