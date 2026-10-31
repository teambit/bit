mod archive;
mod freezer;
mod spool;
mod wire;

use super::{Body, Descriptor, MAX_BYTES, MAX_OBJECTS, State, collection, invalid, object};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Clone)]
pub(super) struct Entry {
    pub(super) hash: [u8; 20],
    pub(super) scope: Option<String>,
    pub(super) kind: String,
    pub(super) compressed: std::sync::Arc<[u8]>,
    pub(super) raw: usize,
    pub(super) path: Option<PathBuf>,
}

pub(super) struct Plan {
    pub(super) entries: Vec<Entry>,
    pub(super) objects_hash: String,
}

pub(super) fn collect(state: &mut State, input: &Value) -> io::Result<Value> {
    let request = wire::collect(input)?;
    staging(&request.staging_directory, state)?;
    let descriptors = selection(&request)?;
    let frozen = freezer::freeze(
        &request.objects_directory,
        descriptors,
        request.mode == "objects" && request.options.graceful_missing,
    )?;
    let mut entries = frozen.entries;
    aggregate(state, &entries)?;
    let token = state.token(&serde_json::to_vec(input).map_err(io::Error::other)?)?;
    for (index, entry) in entries.iter_mut().enumerate() {
        entry.path = Some(request.staging_directory.join(format!("{token}-{index}.object")));
    }
    let mut output = describe(&token, &entries);
    if request.mode == "objects" {
        output["missingIndices"] = json!(
            request.refs
                .iter()
                .enumerate()
                .filter_map(|(index, text)| {
                    let hash = crate::merge_history::hash(text).ok()?;
                    frozen.missing.contains(&hash).then_some(index)
                })
                .collect::<Vec<_>>()
        );
    }
    if serde_json::to_vec(&output).map_err(io::Error::other)?.len() > 4 * 1024 * 1024 {
        return Err(invalid("collection output budget"));
    }
    state.spool_paths.extend(spool::write(&entries)?);
    state.collections.insert(token, entries);
    Ok(output)
}

fn selection(request: &wire::Collect) -> io::Result<Vec<Descriptor>> {
    if request.mode == "objects" {
        if request.refs.len() > MAX_OBJECTS
            || !request.versions.is_empty()
            || !request.options.graceful_missing
        {
            return Err(invalid("unsupported objects collection"));
        }
        let mut seen = HashSet::new();
        let mut descriptors = Vec::new();
        for text in &request.refs {
            let hash = crate::merge_history::hash(text)?;
            if seen.insert(hash) {
                descriptors.push(Descriptor {
                    hash,
                    scope: request.scope.clone(),
                    seconds: 0,
                    body: Body::Repository,
                });
            }
        }
        return Ok(descriptors);
    }
    let versions = request.versions
        .iter()
        .map(wire::Version::convert)
        .collect::<io::Result<Vec<_>>>()?;
    let mode = match request.mode.as_str() {
        "export" => collection::Mode::Export {
            strict_local_artifacts: request.options.throw_for_missing_local_artifacts,
        },
        "fetch" => collection::Mode::Fetch { include_artifacts: request.options.include_artifacts },
        _ => return Err(invalid("unsupported collection mode")),
    };
    collection::select(&request.objects_directory, &versions, request.scope.as_deref(), 0, &mode)
}

fn freeze(directory: &Path, descriptors: Vec<Descriptor>) -> io::Result<Vec<Entry>> {
    Ok(freezer::freeze(directory, descriptors, false)?.entries)
}

fn staging(path: &Path, state: &State) -> io::Result<()> {
    if !path.is_absolute()
        || path
            .to_str()
            .is_none_or(|text| text.len() > 512 || text.contains('\0'))
        || !fs::symlink_metadata(path)?.is_dir()
    {
        return Err(invalid("staging directory must be private empty directory"));
    }
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        if !state.spool_paths.contains(&entry.path()) || !entry.file_type()?.is_file() {
            return Err(invalid("unowned staging entry"));
        }
    }
    Ok(())
}

fn describe(token: &str, entries: &[Entry]) -> Value {
    let objects: Vec<_> = entries.iter().enumerate().map(|(index, entry)| {
        let mut row = json!({"hash":crate::validate::hexadecimal(&entry.hash),"type":entry.kind,"index":index,"compressedPath":entry.path,"compressedSha1":crate::validate::hexadecimal(&Sha1::digest(&entry.compressed)),"bytes":entry.compressed.len()});
        if let Some(scope) = &entry.scope { row["scope"] = json!(scope); }
        row
    }).collect();
    json!({"token":token,"count":entries.len(),"objects":objects,"compressedBytes":entries.iter().map(|entry|entry.compressed.len()).sum::<usize>(),"rawBytes":entries.iter().map(|entry|entry.raw).sum::<usize>()})
}

pub(super) fn initialize(state: &mut State, input: &Value) -> io::Result<Value> {
    let request: wire::Initialize =
        serde::Deserialize::deserialize(input).map_err(io::Error::other)?;
    if request.objects.len() > MAX_OBJECTS {
        return Err(invalid("transfer initialization count limit"));
    }
    let mut entries = Vec::new();
    let mut seen = HashSet::new();
    for fragment in request.objects {
        let entry = fragment_entry(state, fragment)?;
        if seen.insert((entry.scope.clone(), entry.hash)) {
            entries.push(entry);
        }
    }
    limits(&entries)?;
    aggregate(state, &entries)?;
    let token = state.token(&serde_json::to_vec(input).map_err(io::Error::other)?)?;
    let mut digest = Sha1::new();
    for entry in &entries {
        digest.update(&entry.compressed);
    }
    let objects_hash = crate::validate::hexadecimal(&digest.finalize());
    let output = json!({"token":token,"count":entries.len(),"objectsHash":objects_hash});
    state.plans.insert(token, Plan { entries, objects_hash });
    Ok(output)
}

fn fragment_entry(state: &State, fragment: wire::Fragment) -> io::Result<Entry> {
    match fragment {
        wire::Fragment::Collection(reference) => {
            let mut entry = state.collections
                .get(&reference.collection_token)
                .and_then(|entries| entries.get(reference.index))
                .cloned()
                .ok_or_else(|| invalid("unknown collection provenance"))?;
            entry.scope = reference.scope;
            object::name(&Descriptor {
                hash: entry.hash,
                scope: entry.scope.clone(),
                seconds: 0,
                body: Body::Repository,
            })?;
            Ok(entry)
        }
        wire::Fragment::Metadata { metadata } => {
            let descriptor = Descriptor {
                hash: crate::merge_history::hash(&metadata.hash)?,
                scope: metadata.scope,
                seconds: 0,
                body: Body::Metadata(wire::hexadecimal(&metadata.compressed)?),
            };
            let mut entries = freeze(Path::new("/"), vec![descriptor])?;
            let entry = entries.pop().ok_or_else(|| invalid("empty metadata"))?;
            if metadata.kind
                .as_ref()
                .is_some_and(|kind| entry.kind != *kind)
            {
                return Err(invalid("metadata type differs"));
            }
            Ok(entry)
        }
    }
}

fn aggregate(state: &State, extra: &[Entry]) -> io::Result<()> {
    let mut compressed = 0;
    let mut raw = 0;
    let mut count = state.collections.len() + state.plans.len();
    let mut seen = HashSet::new();
    let entries = extra
        .iter()
        .chain(state.collections.values().flatten())
        .chain(state.plans.values().flat_map(|plan| plan.entries.iter()));
    for entry in entries {
        count += 1;
        if seen.insert(std::sync::Arc::as_ptr(&entry.compressed).cast::<u8>()) {
            compressed += entry.compressed.len();
            raw += entry.raw;
        }
    }
    if compressed > MAX_BYTES
        || raw > MAX_BYTES
        || count > MAX_OBJECTS
        || state.spool_paths.len() + extra.len() > MAX_OBJECTS
    {
        return Err(invalid("owned collection budget"));
    }
    Ok(())
}

fn limits(entries: &[Entry]) -> io::Result<()> {
    if entries.len() > MAX_OBJECTS
        || entries
            .iter()
            .map(|entry| entry.compressed.len())
            .sum::<usize>()
            > MAX_BYTES
        || entries
            .iter()
            .map(|entry| entry.raw)
            .sum::<usize>()
            > MAX_BYTES
    {
        return Err(invalid("owned transfer budget"));
    }
    Ok(())
}

pub(super) fn archive(state: &State, input: &Value) -> io::Result<Value> {
    let request: wire::Archive = serde::Deserialize::deserialize(input).map_err(io::Error::other)?;
    let plan = state.plans.get(&request.token).ok_or_else(|| invalid("unknown transfer token"))?;
    archive::write(plan, &request)
}

#[cfg(test)]
mod tests;
