#[cfg(test)]
mod tests;

use super::{Input, invalid};
use crate::{read_budget::Budget, workspace::engine::dependency_graph::proof};
use rayon::prelude::*;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{fs, io, path::Path};

pub(super) fn prepare(
    root: &Path,
    input: &Input<'_>,
    hash: &str,
    version: &mut Value,
    objects: &mut Vec<Value>,
    proofs: &mut Vec<proof::Proof>,
    budget: &Budget,
) -> io::Result<()> {
    let rows = capture(&input.material.version, &input.material.files, budget)?;
    let (mut files, captured): (Vec<_>, Vec<_>) = rows.into_iter().unzip();
    objects.extend(captured);
    files.sort_by(|a, b| {
        a["relativePath"]
            .as_str()
            .unwrap_or_default()
            .encode_utf16()
            .cmp(
                b["relativePath"]
                    .as_str()
                    .unwrap_or_default()
                    .encode_utf16(),
            )
    });
    version["files"] = json!(files);
    edges(root, input, hash, version, objects, proofs)
}

fn capture(version: &Value, files: &[Value], budget: &Budget) -> io::Result<Vec<(Value, Value)>> {
    if files.len() >= 32 && rayon::current_num_threads() > 1 {
        files
            .par_iter()
            .map(|file| source(version, file, budget))
            .collect()
    } else {
        files
            .iter()
            .map(|file| source(version, file, budget))
            .collect()
    }
}
fn edges(
    root: &Path,
    input: &Input<'_>,
    hash: &str,
    version: &mut Value,
    objects: &mut Vec<Value>,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let mut graph = read_graph(root, version, proofs)?;
    let rows = graph.as_array_mut().ok_or_else(|| invalid("command snap flattened graph rows"))?;
    if rows.len() > 16384 {
        return Err(invalid("command snap flattened graph budget"));
    }
    rekey(rows, input.identity, hash);
    let body = serde_json::to_vec(&graph).map_err(io::Error::other)?;
    let identity = digest(&body);
    version["flattenedEdgesRef"] = json!(identity);
    version
        .as_object_mut()
        .unwrap()
        .remove("flattenedEdges");
    objects.push(
        json!({"type":"Source","hash":identity,"body":crate::validate::hexadecimal(&body)}),
    );
    Ok(())
}
/// The snap's `DependenciesGraph`, which the client computed from the
/// lockfile: stored as a Source the Version refers to.
pub(super) fn dependencies_graph(
    allocation: &Value,
    version: &mut Value,
    objects: &mut Vec<Value>,
) -> io::Result<()> {
    let Some(graph) = allocation.get("dependenciesGraph") else { return Ok(()) };
    let graph = graph.as_str().ok_or_else(|| invalid("command snap dependencies graph"))?;
    if graph.len() > 16 * 1024 * 1024 {
        return Err(invalid("command snap dependencies graph budget"));
    }
    let identity = digest(graph.as_bytes());
    version["dependenciesGraphRef"] = json!(identity);
    objects.push(
        json!({"type":"Source","hash":identity,"body":crate::validate::hexadecimal(graph.as_bytes())}),
    );
    Ok(())
}
fn digest(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}

fn source(version: &Value, file: &Value, budget: &Budget) -> io::Result<(Value, Value)> {
    let source = &file["source"];
    if source.get("spoolOffset").is_some() {
        return Err(invalid("command snap packed body unsupported"));
    }
    let path = source["spoolPath"]
        .as_str()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .ok_or_else(|| invalid("command snap source path"))?;
    let relative_path = file["relativePath"]
        .as_str()
        .map(str::trim)
        .filter(|rel| !rel.is_empty())
        .ok_or_else(|| invalid("command snap relative path"))?;
    let bytes = budget.read(fs::File::open(path)?)?;
    if source["spoolHash"].as_str().map(str::trim) != Some(digest(&bytes).as_str()) {
        return Err(invalid("command snap source proof"));
    }
    let bytes = if bytes.starts_with(&[239, 187, 191]) { bytes[3..].to_vec() } else { bytes };
    let normalized = crate::checkout::eol::normalize(bytes, false);
    let identity = digest(&normalized);
    let test = version["files"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["relativePath"] == file["relativePath"])
        })
        .and_then(|row| row.get("test"))
        .cloned()
        .unwrap_or(json!(false));
    let row = json!({"file":identity,"relativePath":relative_path,"name":relative_path.rsplit('/').next(),"test":test});
    let object = json!({"type":"Source","hash":identity,"source":{"path":path,"hash":source["spoolHash"],"sourceHash":identity,"normalization":"workspace"}});
    Ok((row, object))
}

fn read_graph(root: &Path, version: &Value, proofs: &mut Vec<proof::Proof>) -> io::Result<Value> {
    if let Some(graph) = version.get("flattenedEdges") {
        return Ok(graph.clone());
    }
    let old = version["flattenedEdgesRef"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("command snap flattened graph"))?;
    crate::merge_history::hash(old)?;
    proof::read(
        &crate::scope_path(root)
            .join("objects")
            .join(&old[..2])
            .join(&old[2..]),
        proofs,
    )?;
    let mut compressed = 0;
    let bytes = crate::checkout::repository::source(
        &crate::scope_path(root).join("objects"),
        crate::merge_history::hash(old)?,
        4 * 1024 * 1024,
        &mut compressed,
    )?;
    proof::verify(&proofs[proofs.len() - 1..])?;
    crate::parse_jsonc(&bytes)
}

fn rekey(rows: &mut [Value], identity: &str, hash: &str) {
    let identity = identity.trim();
    let pending = rows
        .iter()
        .any(|row| row["source"]["version"] == super::PENDING_GRAPH_VERSION);
    for row in rows {
        let source = &mut row["source"];
        if format!(
            "{}/{}",
            source["scope"]
                .as_str()
                .map(str::trim)
                .unwrap_or_default(),
            source["name"]
                .as_str()
                .map(str::trim)
                .unwrap_or_default(),
        ) == identity
            && (!pending || source["version"] == super::PENDING_GRAPH_VERSION)
        {
            source["version"] = json!(hash);
        }
    }
}
