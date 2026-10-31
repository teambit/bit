use super::{invalid, wire};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::HashMap,
    fs::OpenOptions,
    io::{self, Write},
    path::PathBuf,
};
#[derive(Default)]
pub(super) struct State {
    pub(super) plans: HashMap<String, Plan>,
    sequence: u64,
}
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
pub(super) struct Current {
    pub(super) relative_path: String,
    pub(super) path: PathBuf,
    pub(super) protected: bool,
    pub(super) plan_index: usize,
    pub(super) shares_buffer: bool,
    pub(super) raw_hash: String,
}
pub(super) struct Body {
    pub(super) offset: Option<usize>,
    pub(super) contents: Vec<u8>,
    pub(super) path: PathBuf,
    pub(super) hash: String,
}
impl Body {
    pub(super) fn new(contents: Vec<u8>) -> Self {
        let hash = crate::validate::hexadecimal(&Sha1::digest(&contents));
        Self { contents, path: PathBuf::new(), hash, offset: None }
    }
    pub(super) fn manifest(&self, index: usize) -> Value {
        let mut row = json!({"planIndex":index,"spoolPath":self.path,"spoolHash":self.hash,"bytes":self.contents.len()});
        if let Some(offset) = self.offset {
            row["spoolOffset"] = json!(offset);
        }
        row
    }
    pub(super) fn spool(&self) -> io::Result<()> {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&self.path)?
            .write_all(&self.contents)
    }
}
impl Plan {
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
                row["relativePath"] = json!(file.relative_path);
                row["hash"] = json!(file.hash);
                row
            })
            .collect::<Vec<_>>();
        json!({"token":token,"count":self.bodies.len(),"hasConflicts":self.has_conflicts,"targetFiles":target,"bodies":self.bodies.iter().enumerate().map(|(index,body)|body.manifest(index)).collect::<Vec<_>>(),"mergeRows":self.merge_rows,"statuses":self.statuses,"removals":[],"currentFiles":self.current.iter().enumerate().map(|(index,file)|{let mut row=self.bodies[file.plan_index].manifest(file.plan_index);row["index"]=json!(index);row["relativePath"]=json!(file.relative_path);row["currentHash"]=json!(self.bodies[file.plan_index].hash);row["sharesCurrent"]=json!(file.shares_buffer);row["protected"]=json!(file.protected);row}).collect::<Vec<_>>()})
    }
}
impl State {
    pub(super) fn retain(
        &mut self,
        mut plan: Plan,
        input: &Value,
        directory: &std::path::Path,
    ) -> io::Result<Value> {
        let retained: usize = self.plans
            .values()
            .map(Plan::bytes)
            .fold(0_usize, usize::saturating_add);
        let count: usize = self.plans
            .values()
            .map(|plan| plan.bodies.len())
            .fold(0_usize, usize::saturating_add);
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
        digest.update(serde_json::to_vec(input).map_err(io::Error::other)?);
        let token = crate::validate::hexadecimal(&digest.finalize());
        for (index, body) in plan.bodies.iter_mut().enumerate() {
            body.path = directory.join(format!("{token}-{index}.checkout"));
        }
        if input["packedBodies"] == true {
            super::spool::assign(&mut plan.bodies, directory, &token, 0);
        }
        let output = plan.manifest(&token);
        if serde_json::to_vec(&output).map_err(io::Error::other)?.len() > 4 * 1024 * 1024 {
            return Err(invalid("checkout manifest output limit"));
        }
        super::spool::write(&plan.bodies)?;
        self.sequence = sequence;
        self.plans.insert(token, plan);
        Ok(output)
    }
}
