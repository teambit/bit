//! Native cache publication around the published semantic documentation parser.
mod cache_hits;
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
        environment.tracking_docs(root, &plan.misses)?
    };
    if observed != observe(root, components)? {
        return Err(io::Error::other("tracking documentation sources changed"));
    }
    let parsed = writes.as_array().ok_or_else(|| io::Error::other("tracking docs receipt"))?;
    let mut writes = plan.proven;
    writes.extend(parsed.iter().cloned());
    order(root, components, &mut writes)?;
    let entries = validate(&writes, &observed)?;
    for (path, bytes) in entries {
        if write_cache {
            bit_install::dependencies::cache::put(&directory, &path, &bytes)?;
        }
    }
    Ok(())
}
fn validate(
    writes: &[Value],
    observed: &BTreeMap<PathBuf, Source>,
) -> io::Result<Vec<(String, String)>> {
    let mut total = 0;
    let mut entries = Vec::new();
    for row in writes {
        let path = row["path"].as_str().ok_or_else(|| io::Error::other("tracking docs path"))?;
        if !observed.contains_key(Path::new(path)) {
            return Err(io::Error::other("tracking docs unknown source"));
        }
        let bytes = bit_object_import::stringify_json(&row["docs"], false)?;
        total += bytes.len();
        if total > 32 * 1024 * 1024 {
            return Err(io::Error::other("tracking docs metadata budget"));
        }
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
            .and_then(|path| ranks.get(Path::new(path)))
            .copied()
            .unwrap_or(usize::MAX)
    });
    Ok(())
}
