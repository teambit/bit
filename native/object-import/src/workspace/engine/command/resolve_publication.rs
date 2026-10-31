//! Filesystem publication for an ordinary merge-resolution snapshot.
mod controls;
use super::{bitmap, invalid, merge::finalization, resolve_snapshot};
use crate::workspace::engine::dependency_graph::proof;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Clone, Copy)]
pub(super) struct Options<'a> {
    pub imported_index: Option<&'a Value>,
    pub snapshot: bool,
}

pub(super) struct Prepared {
    bitmap: bitmap::Prepared,
    finalization: finalization::Prepared,
    controls: controls::Prepared,
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
    snapshot: bool,
) -> io::Result<()> {
    let heads: HashMap<_, _> = materials
        .iter()
        .map(|material| {
            let current = material.version_state.current_head.as_str();
            let head = if current.is_empty() {
                "0000000000000000000000000000000000000000"
            } else {
                current
            };
            (material.identity.as_str(), head)
        })
        .collect();
    let versions = materials
        .iter()
        .map(|material| {
            let mut version = material.version.clone();
            if let Some(fields) = version.as_object_mut() {
                fields.remove("pinnedDependencies");
            }
            resolve_markers(&mut version, &heads)?;
            Ok(json!({"identity":material.identity,"hash":heads[material.identity.as_str()],"version":version}))
        })
        .collect::<io::Result<Vec<_>>>()?;
    let receipt = json!({"log":{"message":""}});
    let opts = Options { imported_index, snapshot };
    prepare(root, context, materials, &versions, pending, &receipt, opts)?.validate()
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
    if key == "id"
        && let Some((identity, suffix)) = value
            .as_str()
            .and_then(|text| text.rsplit_once('@'))
        && suffix.strip_prefix("__bit_pending_snapshot__:") == Some(identity)
    {
        *value = json!(format!(
            "{identity}@{}",
            heads.get(identity).ok_or_else(|| invalid("resolve preflight batch identity"))?
        ));
        return Ok(());
    }
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
        add_material_to_batch(context, material, version, &mut output)?;
    }
    Ok(output)
}

fn add_material_to_batch<'a>(
    context: &'a Value,
    material: &'a resolve_snapshot::Material,
    version: &'a Value,
    output: &mut Batch<'a>,
) -> io::Result<()> {
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
        let ver_str = material.version_state.tagged_version.as_deref().unwrap_or(hash);
        output.updates.push(bitmap_update(material, version, ver_str));
    }
    output.inputs.push(finalization::Input {
        identity: &material.identity,
        directory,
        hash,
        semantic_version: material.version_state.tagged_version.as_deref(),
        version: &version["version"],
    });
    Ok(())
}

fn bitmap_update(
    material: &resolve_snapshot::Material,
    version: &Value,
    hash: &str,
) -> bitmap::Update {
    let main_file = version["version"]["mainFile"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    bitmap::Update {
        identity: material.identity.clone(),
        version: hash.to_owned(),
        main_file,
        keep_ours: true,
    }
}

fn directory<'a>(context: &'a Value, material: &resolve_snapshot::Material) -> io::Result<&'a str> {
    if material.hidden {
        return Ok("");
    }
    let rows = context["targets"].as_array();
    rows.and_then(|list| {
        list.iter()
            .find(|row| row["identity"] == material.identity)
    })
    .and_then(|row| row["directory"].as_str())
    .ok_or_else(|| invalid("resolve publication directory"))
}

fn reason(receipt: &Value, tag: bool) -> String {
    let message = receipt["log"]["message"].as_str().unwrap_or_default();
    let label = if tag { "tag" } else { "snap" };
    let msg = if message.is_empty() { "N/A" } else { message };
    format!("{label} (message: {msg})")
}

fn lane_new_ids(context: &Value, materials: &[resolve_snapshot::Material]) -> Vec<String> {
    if crate::command_import::lane::parse_lane_id(&context["lane"]["currentId"])
        .ok()
        .is_none_or(|lane_id| lane_id.is_main())
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

pub(super) fn prepare(
    root: &Path,
    context: &Value,
    materials: &[resolve_snapshot::Material],
    versions: &[Value],
    pending: &[Value],
    receipt: &Value,
    options: Options<'_>,
) -> io::Result<Prepared> {
    let batch = batch(context, materials, versions)?;
    let lane_new = lane_new_ids(context, materials);
    let bitmap = prepare_resolve_bitmap(root, context, materials, &batch, &lane_new, options)?;
    let finalization = prepare_resolve_finalization(root, materials, &batch, &lane_new, options)?;
    let mut proofs = Vec::new();
    let controls = controls::prepare(root, pending, &batch.identities, &mut proofs)?;
    let is_tag =
        materials.iter().any(|material| material.version_state.tagged_version.is_some());
    let output = Prepared {
        bitmap,
        finalization,
        controls,
        proofs,
        reason: reason(receipt, is_tag),
        removed_root: root.to_path_buf(),
        removed: batch.removed_paths,
    };
    output.validate()?;
    Ok(output)
}

fn prepare_resolve_bitmap(
    root: &Path,
    context: &Value,
    materials: &[resolve_snapshot::Material],
    batch: &Batch<'_>,
    lane_new: &[String],
    options: Options<'_>,
) -> io::Result<bitmap::Prepared> {
    let original = fs::read(root.join(".bitmap"))?;
    let mut bitmap = bitmap::prepare_bytes(root, original, context, &batch.updates, &batch.removed)
        .map_err(|error| io::Error::new(error.kind(), format!("resolve bitmap: {error}")))?;
    let update_ids = || {
        batch.updates
            .iter()
            .map(|update| update.identity.clone())
            .collect::<Vec<_>>()
    };
    if materials.iter().any(|material| material.version_state.tagged_version.is_some()) {
        bitmap.clear_next_versions(context, &update_ids())?;
    }
    if options.snapshot {
        bitmap.clear_config(context, &update_ids())?;
    }
    bitmap.mark_lane_new(context, lane_new)?;
    Ok(bitmap)
}

fn prepare_resolve_finalization(
    root: &Path,
    materials: &[resolve_snapshot::Material],
    batch: &Batch<'_>,
    lane_new: &[String],
    options: Options<'_>,
) -> io::Result<finalization::Prepared> {
    let mut finalization = if options.snapshot {
        finalization::prepare_snapshot_publication(root, &batch.inputs, &batch.removed)
    } else {
        finalization::prepare_publication(root, &batch.inputs, true, &batch.removed)
    }
    .map_err(|error| io::Error::new(error.kind(), format!("resolve finalization: {error}")))?;
    finalization.mark_lane_new(root, lane_new)?;
    finalization.resolve_licenses(root, &batch.inputs, &batch.removed)?;
    finalization.imported_index(root, options.imported_index)?;
    finalization.snapshot_index(
        root,
        materials
            .iter()
            .filter(|material| material.version_state.current_head.is_empty())
            .map(|material| material.identity.as_str()),
    )?;
    Ok(finalization)
}

impl Prepared {
    pub(super) fn stage_controls(&mut self) -> io::Result<Vec<proof::Proof>> {
        self.validate()?;
        let proofs = self.controls.stage()?;
        self.proofs.retain(|before| {
            !proofs
                .iter()
                .any(|after| before.path == after.path)
        });
        self.proofs.extend(proofs.iter().cloned());
        Ok(proofs)
    }

    pub(super) fn accept_published(&mut self, files: &HashMap<PathBuf, Vec<u8>>) -> io::Result<()> {
        proof::accept_published(&mut self.proofs, files);
        self.finalization.accept_published(files)?;
        self.validate()
    }

    pub(super) fn stage_index(&mut self, root: &Path) -> io::Result<(PathBuf, Vec<u8>)> {
        self.finalization.stage_index(root)
    }

    pub(super) fn package_manifest_plans(&self, versions: &[Value]) -> io::Result<Vec<Value>> {
        let mut plans = self.finalization.package_manifest_plans()?;
        for plan in &mut plans {
            let version = versions
                .iter()
                .find(|version| version["identity"] == plan["identity"])
                .ok_or_else(|| invalid("snapshot package version absent"))?;
            plan["versionData"] = version["version"].clone();
        }
        Ok(plans)
    }
    pub(super) fn package_manifests(
        &mut self,
        manifests: &[Value],
        versions: &[Value],
    ) -> io::Result<()> {
        let aspects = versions
            .iter()
            .filter(|version| {
                version["version"]["extensions"]
                    .as_array()
                    .is_some_and(|extensions| {
                        extensions.iter().any(|extension| {
                            crate::workspace::engine::client_status::config::is_extension_aspect(
                                extension,
                                "teambit.envs/envs",
                            ) && extension["data"]["type"] == "aspect"
                        })
                    })
            })
            .filter_map(|version| version["identity"].as_str().map(str::to_owned))
            .collect();
        self.finalization.package_manifests_with_aspects(manifests, &aspects)
    }

    pub(super) fn stage_snaps(&mut self, root: &Path) -> io::Result<Vec<u8>> {
        self.finalization.stage_snaps(root)
    }
    pub(super) fn keep_staged_snaps(&mut self, root: &Path, bytes: &[u8]) -> io::Result<()> {
        self.finalization.keep_staged_snaps(root, bytes)
    }
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
        self.controls.commit()?;
        self.finalization.commit()?;
        for directory in &self.removed {
            fs::remove_dir_all(self.removed_root.join(directory))?;
        }
        let backup = self.bitmap.commit(file_id, &self.reason)?;
        if backup.is_some() {
            return Err(invalid("resolve bitmap history backup"));
        }
        Ok(())
    }
}
