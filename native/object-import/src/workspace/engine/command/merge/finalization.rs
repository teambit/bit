#[cfg(test)]
mod tests;

mod packages;
mod staged;
use super::invalid;
use crate::workspace::engine::dependency_graph::proof;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(in crate::workspace::engine::command) struct Input<'a> {
    pub identity: &'a str,
    pub directory: &'a str,
    pub hash: &'a str,
    pub version: &'a Value,
}
pub(in crate::workspace::engine::command) struct Prepared {
    proofs: Vec<proof::Proof>,
    writes: Vec<(PathBuf, Vec<u8>)>,
    links: Vec<(PathBuf, PathBuf)>,
    copies: Vec<(PathBuf, PathBuf)>,
}
pub(in crate::workspace::engine::command) fn prepare(
    root: &Path,
    inputs: &[Input<'_>],
    root_components: bool,
) -> io::Result<Prepared> {
    if inputs.len() > 4096 {
        return Err(invalid("merge finalization component budget"));
    }
    let mut prepared =
        Prepared { proofs: Vec::new(), writes: Vec::new(), links: Vec::new(), copies: Vec::new() };
    staged::prepare(root, inputs, &mut prepared)?;
    for input in inputs {
        packages::prepare(root, input, root_components, &mut prepared)?;
    }
    #[cfg(not(unix))]
    if !prepared.links.is_empty() {
        return Err(invalid("merge native linking platform"));
    }
    prepared.validate()?;
    Ok(prepared)
}
impl Prepared {
    pub(in crate::workspace::engine::command) fn validate(&self) -> io::Result<()> {
        proof::verify(&self.proofs)
    }
    pub(in crate::workspace::engine::command) fn commit(&self) -> io::Result<()> {
        // Validation belongs before the command's first write; source materialization has
        // already happened when these links and generated package metadata are published.
        for (source, destination) in &self.links {
            fs::create_dir_all(destination.parent().ok_or_else(|| invalid("merge link parent"))?)?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(source, destination)?;
            #[cfg(not(unix))]
            return Err(invalid("merge native linking platform"));
        }
        for (source, destination) in &self.copies {
            fs::create_dir_all(destination.parent().ok_or_else(|| invalid("merge copy parent"))?)?;
            if fs::hard_link(source, destination).is_err() {
                fs::copy(source, destination)?;
            }
        }
        for (path, bytes) in &self.writes {
            fs::create_dir_all(path.parent().ok_or_else(|| invalid("merge metadata parent"))?)?;
            fs::write(path, bytes)?;
        }
        Ok(())
    }
}
fn json(bytes: &[u8]) -> io::Result<Value> {
    serde_json::from_slice(bytes).map_err(io::Error::other)
}
fn pretty(value: &Value, newline: bool) -> io::Result<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(io::Error::other)?;
    if newline {
        bytes.push(b'\n');
    }
    Ok(bytes)
}
