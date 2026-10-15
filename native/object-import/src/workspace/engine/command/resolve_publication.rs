//! Filesystem publication for an ordinary merge-resolution snapshot.
use super::{bitmap, invalid, merge::finalization, resolve_snapshot};
use crate::workspace::engine::dependency_graph::proof;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Prepared {
    bitmap: bitmap::Prepared,
    finalization: finalization::Prepared,
    pending_path: PathBuf,
    pending_bytes: Option<Vec<u8>>,
    proofs: Vec<proof::Proof>,
    reason: String,
    removed_root: PathBuf,
    removed: Vec<PathBuf>,
}

/// Exercise every filesystem publication domain before requesting snapshot scalars.
/// Placeholder versions are only used to validate shape and existing package layout;
/// the final plan is rebuilt with the allocated hashes immediately before commit.
pub(super) fn preflight(
    root: &Path,
    context: &Value,
    materials: &[resolve_snapshot::Material],
    pending: &[Value],
    imported_index: Option<&Value>,
) -> io::Result<()> {
    let heads = materials
        .iter()
        .map(|material| {
            (
                material.identity.as_str(),
                if material.version_state.current_head.is_empty() {
                    "0000000000000000000000000000000000000000"
                } else {
                    material.version_state.current_head.as_str()
                },
            )
        })
        .collect::<HashMap<_, _>>();
    let versions = materials
        .iter()
        .map(|material| {
            let mut version = material.version.clone();
            resolve_markers(&mut version, &heads)?;
            Ok(json!({"identity":material.identity,"hash":heads[material.identity.as_str()],"version":version}))
        })
        .collect::<io::Result<Vec<_>>>()?;
    let receipt = json!({"log":{"message":""}});
    prepare(root, context, materials, &versions, pending, &receipt, imported_index)?.validate()
}

fn resolve_markers(value: &mut Value, heads: &HashMap<&str, &str>) -> io::Result<()> {
    match value {
        Value::Array(rows) => {
            for row in rows {
                resolve_markers(row, heads)?;
            }
        }
        Value::Object(fields) => {
            for (key, child) in fields {
                resolve_field(key, child, heads)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn resolve_field(key: &str, value: &mut Value, heads: &HashMap<&str, &str>) -> io::Result<()> {
    if key != "version" {
        return resolve_markers(value, heads);
    }
    if let Some(identity) = value
        .as_str()
        .and_then(|text| text.strip_prefix("__bit_pending_snapshot__:"))
    {
        *value =
            json!(heads.get(identity).ok_or_else(|| invalid("resolve preflight batch identity"))?);
    }
    Ok(())
}

struct Batch<'a> {
    identities: HashSet<&'a str>,
    updates: Vec<bitmap::Update>,
    inputs: Vec<finalization::Input<'a>>,
    removed: Vec<String>,
    removed_paths: Vec<PathBuf>,
}

#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::excessive_cognitive_complexity,
        perfectionist::overly_long_function,
        reason = "The publication batch checks selected and removed components together before any workspace write"
    )
)]
fn batch<'a>(
    context: &'a Value,
    materials: &'a [resolve_snapshot::Material],
    versions: &'a [Value],
) -> io::Result<Batch<'a>> {
    if materials.len() != versions.len() || materials.is_empty() {
        return Err(invalid("resolve publication count"));
    }
    let mut output = Batch {
        identities: HashSet::new(),
        updates: Vec::new(),
        inputs: Vec::new(),
        removed: Vec::new(),
        removed_paths: Vec::new(),
    };
    for (material, version) in materials.iter().zip(versions) {
        if version["identity"] != material.identity
            || !output.identities.insert(material.identity.as_str())
        {
            return Err(invalid("resolve publication identity"));
        }
        let hash = version["hash"].as_str().ok_or_else(|| invalid("resolve publication hash"))?;
        crate::merge_history::hash(hash)?;
        let directory = directory(context, material)?;
        if !material.hidden && resolve_snapshot::is_removed(&version["version"]) {
            crate::checkout::plan::relative_path(directory)?;
            if directory == "." || directory.is_empty() {
                return Err(invalid("resolve removed directory"));
            }
            output.removed.push(material.identity.clone());
            output.removed_paths.push(PathBuf::from(directory));
        } else if !material.hidden {
            output.updates.push(bitmap_update(
                material,
                version,
                material.version_state.tagged_version.as_deref().unwrap_or(hash),
            ));
        }
        output.inputs.push(finalization::Input {
            identity: &material.identity,
            directory,
            hash,
            semantic_version: material.version_state.tagged_version.as_deref(),
            version: &version["version"],
        });
    }
    Ok(output)
}

fn bitmap_update(
    material: &resolve_snapshot::Material,
    version: &Value,
    hash: &str,
) -> bitmap::Update {
    bitmap::Update {
        identity: material.identity.clone(),
        version: hash.to_owned(),
        main_file: version["version"]["mainFile"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        keep_ours: true,
    }
}

fn directory<'a>(context: &'a Value, material: &resolve_snapshot::Material) -> io::Result<&'a str> {
    if material.hidden {
        return Ok("");
    }
    context["targets"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["identity"] == material.identity)
        })
        .and_then(|row| row["directory"].as_str())
        .ok_or_else(|| invalid("resolve publication directory"))
}

fn pending_bytes(pending: &[Value], identities: &HashSet<&str>) -> io::Result<Vec<u8>> {
    let remaining = pending
        .iter()
        .filter(|row| {
            let id = &row["id"];
            let identity = format!(
                "{}/{}",
                id["scope"].as_str().unwrap_or_default(),
                id["name"].as_str().unwrap_or_default(),
            );
            !identities.contains(identity.as_str())
        })
        .collect::<Vec<_>>();
    serde_json::to_vec_pretty(&remaining).map_err(io::Error::other)
}

fn reason(receipt: &Value, tag: bool) -> String {
    let message = receipt["log"]["message"].as_str().unwrap_or_default();
    format!(
        "{} (message: {})",
        if tag { "tag" } else { "snap" },
        if message.is_empty() { "N/A" } else { message },
    )
}

fn lane_new_ids(context: &Value, materials: &[resolve_snapshot::Material]) -> Vec<String> {
    if context["lane"]["currentId"]["name"]
        .as_str()
        .is_none_or(|name| name == "main")
    {
        return Vec::new();
    }
    materials
        .iter()
        .filter(|material| {
            !material.hidden && material.version_state.current_head.is_empty()
        })
        .map(|material| material.identity.clone())
        .collect()
}

#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::overly_long_function,
        reason = "The resolution publication prepares bitmap, staged objects, and source removal as one validated transaction"
    )
)]
pub(super) fn prepare(
    root: &Path,
    context: &Value,
    materials: &[resolve_snapshot::Material],
    versions: &[Value],
    pending: &[Value],
    receipt: &Value,
    imported_index: Option<&Value>,
) -> io::Result<Prepared> {
    let batch = batch(context, materials, versions)?;
    let lane_new = lane_new_ids(context, materials);
    let original = fs::read(root.join(".bitmap"))?;
    let mut bitmap = bitmap::prepare_bytes(root, original, context, &batch.updates, &batch.removed)
        .map_err(|error| io::Error::new(error.kind(), format!("resolve bitmap: {error}")))?;
    if materials.iter().any(|material| material.version_state.tagged_version.is_some()) {
        bitmap.clear_next_versions(
            context,
            &batch.updates
                .iter()
                .map(|update| update.identity.clone())
                .collect::<Vec<_>>(),
        )?;
    }
    bitmap.mark_lane_new(context, &lane_new)?;
    let mut finalization = finalization::prepare(root, &batch.inputs, true, &batch.removed)
        .map_err(|error| io::Error::new(error.kind(), format!("resolve finalization: {error}")))?;
    finalization.mark_lane_new(root, &lane_new)?;
    finalization.resolve_licenses(root, &batch.inputs, &batch.removed)?;
    finalization.imported_index(root, imported_index)?;
    finalization.snapshot_index(
        root,
        materials
            .iter()
            .filter(|material| material.version_state.current_head.is_empty())
            .map(|material| material.identity.as_str()),
    )?;
    let pending_path = root.join(".bit/unmerged.json");
    let mut proofs = Vec::new();
    proof::read(&pending_path, &mut proofs)?;
    let pending_bytes = pending_path
        .try_exists()?
        .then(|| pending_bytes(pending, &batch.identities))
        .transpose()?;
    let output = Prepared {
        bitmap,
        finalization,
        pending_path,
        pending_bytes,
        proofs,
        reason: reason(
            receipt,
            materials
                .iter()
                .any(|material| material.version_state.tagged_version.is_some()),
        ),
        removed_root: root.to_path_buf(),
        removed: batch.removed_paths,
    };
    output.validate()?;
    Ok(output)
}
impl Prepared {
    pub(super) fn validate(&self) -> io::Result<()> {
        self.bitmap.validate()?;
        self.finalization.validate()?;
        for directory in &self.removed {
            let mut path = self.removed_root.clone();
            for segment in directory.components() {
                path.push(segment);
                let metadata = fs::symlink_metadata(&path)?;
                if !metadata.is_dir() || metadata.file_type().is_symlink() {
                    return Err(invalid("resolve removed directory is not ordinary"));
                }
            }
        }
        proof::verify(&self.proofs)
    }
    pub(super) fn commit(&self, file_id: &str) -> io::Result<()> {
        self.validate()?;
        bitmap::validate_history_file_id(file_id)?;
        self.finalization.commit()?;
        for directory in &self.removed {
            fs::remove_dir_all(self.removed_root.join(directory))?;
        }
        let backup = self.bitmap.commit(file_id, &self.reason)?;
        if backup.is_some() {
            return Err(invalid("resolve bitmap history backup"));
        }
        if let Some(bytes) = &self.pending_bytes {
            fs::write(&self.pending_path, bytes)?;
        }
        Ok(())
    }
}
