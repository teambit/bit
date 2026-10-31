//! Native cache publication around the published semantic documentation parser.
pub(in crate::commands) use cat::{CatDocs, cat_prepare};

mod cache_hits;
mod cat;
#[cfg(test)]
mod cat_cache_tests;
mod sources;

use crate::commands::status::{cache, environments::Environments};
use serde_json::{Value, json};
use sources::{Source, observe};
use std::{
    collections::BTreeMap,
    io,
    path::{Path, PathBuf},
};

pub(super) fn load(
    root: &Path,
    environment: &mut Environments,
    components: &[Value],
) -> io::Result<()> {
    prepare(root, environment, components, false)?.publish()
}

pub(in crate::commands) struct Prepared {
    root: PathBuf,
    components: Vec<Value>,
    observed: BTreeMap<PathBuf, Source>,
    directory: PathBuf,
    entries: Vec<(String, String)>,
    write_cache: bool,
    deferred: bool,
}

pub(super) fn prepare(
    root: &Path,
    environment: &mut Environments,
    components: &[Value],
    deferred: bool,
) -> io::Result<Prepared> {
    let write_cache = !cache::no_fs_cache(root);
    let observed = observe(root, components)?;
    let directory = bit_object_import::scope_path(root).join("cache/components/docs");
    let plan = cache_hits::prepare(root, &directory, components, &observed, write_cache);
    if !plan.hits.is_empty() {
        environment.identity_call(root, "trackingCachedDocs", &json!({"entries":plan.hits}))?;
    }
    let writes = if plan.misses.is_empty() {
        json!([])
    } else {
        environment.tracking_docs(root, &plan.misses, deferred)?
    };
    if observed != observe(root, components)? {
        return Err(io::Error::other("tracking documentation sources changed"));
    }
    let parsed = writes.as_array().ok_or_else(|| io::Error::other("tracking docs receipt"))?;
    let mut writes = plan.proven;
    writes.extend(parsed.iter().cloned());
    order(root, components, &mut writes)?;
    let entries = validate(&writes, &observed)?;
    Ok(Prepared {
        root: root.to_owned(),
        components: components.to_vec(),
        observed,
        directory,
        entries,
        write_cache,
        deferred,
    })
}

impl Prepared {
    pub(in crate::commands) fn source_proofs(&self) -> Vec<Value> {
        self.observed
            .iter()
            .map(|(path, source)| {
                bit_install::policy::scope::proof_from_bytes(path, Some(source.bytes()))
            })
            .collect()
    }

    pub(in crate::commands) fn publish(self) -> io::Result<()> {
        // Deferred source proofs are consumed before onLoad. Its authorized edits must
        // not replace the documentation the consumer already parsed from its old files.
        if !self.deferred && self.observed != observe(&self.root, &self.components)? {
            return Err(io::Error::other("prepared documentation sources changed"));
        }
        if !self.write_cache {
            return Ok(());
        }
        for (path, bytes) in self.entries {
            bit_install::dependencies::cache::put(&self.directory, &path, &bytes)?;
        }
        Ok(())
    }
}
fn validate(
    writes: &[Value],
    observed: &BTreeMap<PathBuf, Source>,
) -> io::Result<Vec<(String, String)>> {
    let mut total = 0_usize;
    let mut seen = std::collections::HashSet::new();
    let mut entries = Vec::new();
    for row in writes {
        let path = row["path"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| io::Error::other("tracking docs path"))?;
        if !observed.contains_key(Path::new(path)) || !seen.insert(PathBuf::from(path)) {
            return Err(io::Error::other("tracking docs unknown source"));
        }
        let bytes = bit_object_import::stringify_json(&row["docs"], false)?;
        total = total
            .checked_add(bytes.len())
            .filter(|sum| *sum <= 32 * 1024 * 1024)
            .ok_or_else(|| io::Error::other("tracking docs metadata budget"))?;
        entries.push((path.to_owned(), bytes));
    }
    Ok(entries)
}

fn order(root: &Path, components: &[Value], writes: &mut [Value]) -> io::Result<()> {
    let mut ranks = BTreeMap::new();
    for component in components {
        for file in component["files"]
            .as_array()
            .into_iter()
            .flatten()
        {
            let path = cache_hits::source_path(root, component, file)?;
            let rank = ranks.len();
            ranks.entry(path).or_insert(rank);
        }
    }
    writes.sort_by_key(|row| {
        row["path"]
            .as_str()
            .map(str::trim)
            .and_then(|path| ranks.get(Path::new(path)))
            .copied()
            .unwrap_or(usize::MAX)
    });
    Ok(())
}
