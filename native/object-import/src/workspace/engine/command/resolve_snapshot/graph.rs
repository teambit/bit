//! Flattened dependency edge rewriting via [`graph`] and [`rewrite_batch_refs`] for [`Material`].

use super::{Material, invalid, references::rewrite_batch_refs};
use crate::workspace::engine::dependency_graph::proof;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, io, path::Path};

/// Rewrites co-snapped dependency references, rekeys root edges to `hash`, and stores `flattenedEdges`.
#[inline]
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

/// Reads `flattenedEdges` from `version` or loads the `flattenedEdgesRef` `Source` object from disk.
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
        .map(str::trim)
        .ok_or_else(|| invalid("resolve graph ref"))?;
    let digest = crate::merge_history::hash(old)?;
    let objects_dir = crate::scope_path(root).join("objects");
    proof::read(
        &objects_dir
            .join(&old[..2])
            .join(&old[2..]),
        proofs,
    )?;
    let mut compressed = 0;
    let body = crate::checkout::repository::source(
        &objects_dir,
        digest,
        4 * 1024 * 1024,
        &mut compressed,
    )?;
    let rows = crate::parse_jsonc(&body).map_err(io::Error::other)?;
    proof::verify(&proofs[proofs.len() - 1..])?;
    Ok(rows)
}

/// Updates root source `version` fields in `rows` matching `identity` to the newly allocated `hash`.
fn rekey(rows: &mut Value, identity: &str, hash: &str) -> io::Result<()> {
    let edges = rows.as_array_mut().ok_or_else(|| invalid("resolve graph rows"))?;
    if edges.len() > 16384 {
        return Err(invalid("resolve graph budget"));
    }
    let Some((id_scope, id_name)) = identity
        .trim()
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
    else {
        return Ok(());
    };
    let hash = hash.trim();
    for edge in edges {
        let source = &mut edge["source"];
        if source["scope"].as_str().map(str::trim) == Some(id_scope)
            && source["name"].as_str().map(str::trim) == Some(id_name)
        {
            source["version"] = json!(hash);
        }
    }
    Ok(())
}

#[inline]
fn store(version: &mut Value, rows: &Value, objects: &mut Vec<Value>) -> io::Result<()> {
    let body = serde_json::to_vec(rows).map_err(io::Error::other)?;
    let digest = crate::validate::hexadecimal(&Sha1::digest(&body));
    version["flattenedEdgesRef"] = json!(digest);
    version
        .as_object_mut()
        .ok_or_else(|| invalid("resolve graph Version"))?
        .remove("flattenedEdges");
    objects.push(json!({"type":"Source","hash":digest,"body":crate::validate::hexadecimal(&body)}));
    Ok(())
}
