use super::{Material, invalid, references::rewrite_batch_refs};
use crate::workspace::engine::dependency_graph::proof;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, io, path::Path};

pub(super) fn graph(
    root: &Path,
    version: &mut Value,
    material: &Material,
    hash: &str,
    hashes: &HashMap<&str, &str>,
    objects: &mut Vec<Value>,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let pinned = super::pinned_dependencies(&material.version);
    let mut rows = read(root, version, material, proofs)?;
    rewrite_batch_refs(&mut rows, hashes, &pinned)?;
    rekey(&mut rows, &material.identity, hash)?;
    store(version, &rows, objects)
}

fn read(
    root: &Path,
    version: &Value,
    material: &Material,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<Value> {
    if let Some(rows) = version.get("flattenedEdges") {
        return Ok(rows.clone());
    }
    let old = material.version["flattenedEdgesRef"]
        .as_str()
        .ok_or_else(|| invalid("resolve graph ref"))?;
    let digest = crate::merge_history::hash(old)?;
    proof::read(
        &crate::scope_path(root)
            .join("objects")
            .join(&old[..2])
            .join(&old[2..]),
        proofs,
    )?;
    let mut compressed = 0;
    let body = crate::checkout::repository::source(
        &crate::scope_path(root).join("objects"),
        digest,
        4 * 1024 * 1024,
        &mut compressed,
    )?;
    serde_json::from_slice(&body).map_err(io::Error::other)
}

fn rekey(rows: &mut Value, identity: &str, hash: &str) -> io::Result<()> {
    let edges = rows.as_array_mut().ok_or_else(|| invalid("resolve graph rows"))?;
    if edges.len() > 16384 {
        return Err(invalid("resolve graph budget"));
    }
    for edge in edges {
        let source = &mut edge["source"];
        let scope = source["scope"].as_str().unwrap_or_default();
        let name = source["name"].as_str().unwrap_or_default();
        if format!("{scope}/{name}") == identity {
            source["version"] = json!(hash);
        }
    }
    Ok(())
}

fn store(version: &mut Value, rows: &Value, objects: &mut Vec<Value>) -> io::Result<()> {
    let body = serde_json::to_vec(rows).map_err(io::Error::other)?;
    let digest = crate::validate::hexadecimal(&Sha1::digest(&body));
    version["flattenedEdgesRef"] = json!(digest);
    version
        .as_object_mut()
        .unwrap()
        .remove("flattenedEdges");
    objects.push(json!({"type":"Source","hash":digest,"body":crate::validate::hexadecimal(&body)}));
    Ok(())
}
