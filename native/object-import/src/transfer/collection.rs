//! Repository-backed collection before archive materialization. Version snapshots
//! remain local, while caller metadata can guard the live cache's reference view.
use std::{collections::HashSet, io, path::Path};

use super::{Body, Descriptor, MAX_BYTES, MAX_OBJECTS, invalid, object};

mod shape;
#[cfg(test)]
mod tests;
mod version;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct References {
    pub(crate) sources: Vec<[u8; 20]>,
    pub(crate) artifacts: Vec<[u8; 20]>,
    pub(crate) edges: Option<[u8; 20]>,
    pub(crate) graph: Option<[u8; 20]>,
}

pub(crate) struct Version {
    pub(crate) hash: [u8; 20],
    pub(crate) locally_changed: bool,
    pub(crate) expected: Option<References>,
}

pub(crate) enum Mode {
    Export { strict_local_artifacts: bool },
    Fetch { include_artifacts: bool },
}

pub(crate) fn select(
    directory: &Path,
    versions: &[Version],
    scope: Option<&str>,
    seconds: u32,
    mode: &Mode,
) -> io::Result<Vec<Descriptor>> {
    if !directory.is_absolute() || versions.len() > MAX_OBJECTS {
        return Err(invalid("unsupported transfer collection"));
    }
    let loaded = version::load(directory, versions)?;
    match mode {
        Mode::Export { strict_local_artifacts } => {
            export(directory, versions, &loaded, scope, seconds, *strict_local_artifacts)
        }
        Mode::Fetch { include_artifacts } => {
            fetch(versions, loaded, scope, seconds, *include_artifacts)
        }
    }
}

fn export(
    directory: &Path,
    versions: &[Version],
    loaded: &[version::Loaded],
    scope: Option<&str>,
    seconds: u32,
    strict: bool,
) -> io::Result<Vec<Descriptor>> {
    let mut result = Vec::new();
    for (version, loaded) in versions.iter().zip(loaded) {
        result.push(snapshot(version.hash, loaded.compressed.clone(), scope, seconds));
    }
    for loaded in loaded {
        required(&mut result, &loaded.references, scope, seconds);
    }
    dedup(&mut result);
    for local in [true, false] {
        let mut group = Vec::new();
        for (version, loaded) in versions.iter().zip(loaded) {
            if version.locally_changed == local {
                artifacts(
                    directory,
                    &mut group,
                    &loaded.references.artifacts,
                    scope,
                    seconds,
                    local && strict,
                )?;
            }
        }
        dedup(&mut group);
        result.extend(group);
    }
    bounded(&result)?;
    Ok(result)
}

fn fetch(
    versions: &[Version],
    loaded: Vec<version::Loaded>,
    scope: Option<&str>,
    seconds: u32,
    include_artifacts: bool,
) -> io::Result<Vec<Descriptor>> {
    let mut result = Vec::new();
    for (version, loaded) in versions.iter().zip(loaded) {
        for hash in &loaded.references.sources {
            result.push(reference(*hash, scope, seconds));
        }
        if include_artifacts {
            for hash in &loaded.references.artifacts {
                result.push(reference(*hash, scope, seconds));
            }
        }
        graphs(&mut result, &loaded.references, scope, seconds);
        result.push(snapshot(version.hash, loaded.compressed, scope, seconds));
    }
    let mut seen = HashSet::new();
    result.retain(|item| seen.insert(item.hash));
    bounded(&result)?;
    Ok(result)
}

fn artifacts(
    directory: &Path,
    result: &mut Vec<Descriptor>,
    hashes: &[[u8; 20]],
    scope: Option<&str>,
    seconds: u32,
    strict: bool,
) -> io::Result<()> {
    for hash in hashes {
        bounded(result)?;
        let bytes = result
            .iter()
            .map(|item| match &item.body {
                Body::Snapshot(bytes) => bytes.len(),
                _ => 0,
            })
            .sum::<usize>();
        match object::repository(directory, *hash, MAX_BYTES - bytes) {
            Ok(bytes) => result.push(snapshot(*hash, bytes, scope, seconds)),
            Err(error) if !strict && error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

fn required(result: &mut Vec<Descriptor>, refs: &References, scope: Option<&str>, seconds: u32) {
    for hash in &refs.sources {
        result.push(reference(*hash, scope, seconds));
    }
    graphs(result, refs, scope, seconds);
}

fn graphs(result: &mut Vec<Descriptor>, refs: &References, scope: Option<&str>, seconds: u32) {
    for hash in [refs.edges, refs.graph].into_iter().flatten() {
        result.push(reference(hash, scope, seconds));
    }
}

fn reference(hash: [u8; 20], scope: Option<&str>, seconds: u32) -> Descriptor {
    Descriptor { hash, scope: scope.map(str::to_owned), seconds, body: Body::Repository }
}

fn snapshot(hash: [u8; 20], bytes: Vec<u8>, scope: Option<&str>, seconds: u32) -> Descriptor {
    Descriptor { body: Body::Snapshot(bytes), ..reference(hash, scope, seconds) }
}

fn bounded(items: &[Descriptor]) -> io::Result<()> {
    if items.len() > MAX_OBJECTS {
        return Err(invalid("transfer collection count exceeds bounds"));
    }
    let mut bytes = 0;
    for item in items {
        if let Body::Snapshot(body) = &item.body {
            bytes += body.len();
        }
    }
    if bytes > MAX_BYTES {
        return Err(invalid("transfer collection bytes exceed bounds"));
    }
    Ok(())
}

fn dedup(items: &mut Vec<Descriptor>) {
    let mut seen = HashSet::new();
    items.retain(|entry| seen.insert(entry.hash));
}
