//! Prove that merged bodies preserve the captured dependency graph before autosnap.
#[cfg(test)]
mod tests;
use super::{
    super::{
        dependency_graph::proof,
        invalid,
        resolve_dependencies::{Budget, resolve_one},
    },
    capture::Captured,
};
use rayon::prelude::*;
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::{self, Read, Seek, SeekFrom},
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
};

const MAX_BYTES: usize = 64 * 1024 * 1024;
const MAX_FILE: usize = 1024 * 1024;

pub(super) fn verify(
    root: &Path,
    home: &Path,
    current: &Captured,
    merged: &[Value],
    grammar: &Value,
) -> io::Result<Vec<proof::Proof>> {
    let grammar = Grammar::parse(grammar)?;
    let files = Files::parse(current, merged, &grammar)?;
    let bytes = AtomicUsize::new(0);
    let budget = Budget::capture(true);
    let mut spool_proofs = spool_proofs(merged)?;
    let comparison = Comparison {
        root,
        home,
        directory: &current.target.directory,
        topology_changed: files.before.keys().ne(files.after.keys()),
        builtins: &grammar.builtins,
        detectors: &grammar.detectors,
        typescript: grammar.typescript,
        budget: &budget,
    };
    let results = compare_all(&comparison, &files.names, &files.before, &files.after, &bytes)?;
    let mut proofs = results
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    proofs.append(&mut spool_proofs);
    proofs.extend(budget.proofs()?);
    proof::verify(&proofs)?;
    Ok(proofs)
}
struct Grammar<'a> {
    builtins: HashSet<&'a str>,
    detectors: HashSet<&'a str>,
    typescript: bool,
}
impl<'a> Grammar<'a> {
    fn parse(value: &'a Value) -> io::Result<Self> {
        Ok(Self {
            builtins: strings(&value["builtins"])?,
            detectors: strings(&value["detectorExtensions"])?,
            typescript: value["typescript"]
                .as_bool()
                .ok_or_else(|| invalid("merge dependency TypeScript receipt"))?,
        })
    }
}
struct Files<'a> {
    before: BTreeMap<&'a str, &'a Value>,
    after: BTreeMap<&'a str, &'a Value>,
    names: Vec<&'a str>,
}
impl<'a> Files<'a> {
    fn parse(
        current: &'a Captured,
        merged: &'a [Value],
        grammar: &Grammar<'_>,
    ) -> io::Result<Self> {
        let before =
            current.files.as_array().ok_or_else(|| invalid("merge dependency current files"))?;
        if before.len() > 4096 || merged.len() > 4096 || grammar.builtins.len() > 4096 {
            return Err(invalid("merge dependency input budget"));
        }
        let before = indexed(before)?;
        let after = indexed(merged)?;
        let mut names = before
            .keys()
            .chain(after.keys())
            .copied()
            .collect::<Vec<_>>();
        names.sort_unstable();
        names.dedup();
        Ok(Self { before, after, names })
    }
}
fn compare_all(
    input: &Comparison<'_>,
    names: &[&str],
    before: &BTreeMap<&str, &Value>,
    after: &BTreeMap<&str, &Value>,
    bytes: &AtomicUsize,
) -> io::Result<Vec<Vec<proof::Proof>>> {
    names
        .par_iter()
        .map(|name| {
            let old = before
                .get(name)
                .map(|row| read_current(row, bytes))
                .transpose()?;
            let new = after
                .get(name)
                .map(|row| read_merged(row, bytes))
                .transpose()?;
            compare(input, name, old.as_ref(), new.as_ref())
        })
        .collect()
}
fn indexed(rows: &[Value]) -> io::Result<BTreeMap<&str, &Value>> {
    let mut result = BTreeMap::new();
    for row in rows {
        let name = row["relativePath"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("merge dependency filename"))?;
        crate::checkout::plan::relative_path(name)?;
        if result.insert(name, row).is_some() {
            return Err(invalid("merge dependency duplicate file"));
        }
    }
    Ok(result)
}
struct Source {
    bytes: Vec<u8>,
    proof: Option<proof::Proof>,
}
fn reserve(bytes: usize, budget: &AtomicUsize) -> io::Result<()> {
    if bytes > MAX_FILE || budget.fetch_add(bytes, Ordering::Relaxed) + bytes > MAX_BYTES {
        return Err(invalid("merge dependency source budget"));
    }
    Ok(())
}
fn read_current(row: &Value, budget: &AtomicUsize) -> io::Result<Source> {
    let path =
        Path::new(row["path"].as_str().ok_or_else(|| invalid("merge dependency current path"))?);
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(MAX_FILE as u64 + 1)
        .read_to_end(&mut bytes)?;
    reserve(bytes.len(), budget)?;
    if super::super::hash(&bytes) != row["rawHash"] {
        return Err(invalid("merge dependency stale current"));
    }
    Ok(Source { proof: Some(proof::content(path, &bytes)), bytes })
}
fn read_merged(row: &Value, budget: &AtomicUsize) -> io::Result<Source> {
    let source = &row["source"];
    let path = Path::new(
        source["spoolPath"].as_str().ok_or_else(|| invalid("merge dependency spool path"))?,
    );
    let size = source["bytes"].as_u64().ok_or_else(|| invalid("merge dependency spool size"))?;
    if size > MAX_FILE as u64 {
        return Err(invalid("merge dependency spool budget"));
    }
    let mut file = fs::File::open(path)?;
    file.seek(SeekFrom::Start(source["spoolOffset"].as_u64().unwrap_or(0)))?;
    let mut bytes = Vec::new();
    file.take(size).read_to_end(&mut bytes)?;
    reserve(bytes.len(), budget)?;
    if bytes.len() as u64 != size || super::super::hash(&bytes) != source["spoolHash"] {
        return Err(invalid("merge dependency stale spool"));
    }
    Ok(Source { proof: None, bytes })
}
fn spool_proofs(files: &[Value]) -> io::Result<Vec<proof::Proof>> {
    let mut seen = HashSet::new();
    let mut proofs = Vec::new();
    for row in files {
        let path = row["source"]["spoolPath"]
            .as_str()
            .ok_or_else(|| invalid("merge dependency spool path"))?;
        if seen.insert(path) {
            proof::read(Path::new(path), &mut proofs)?
                .ok_or_else(|| invalid("merge dependency absent spool"))?;
        }
    }
    Ok(proofs)
}

struct Comparison<'a> {
    root: &'a Path,
    home: &'a Path,
    directory: &'a str,
    topology_changed: bool,
    builtins: &'a HashSet<&'a str>,
    detectors: &'a HashSet<&'a str>,
    typescript: bool,
    budget: &'a Budget,
}
fn compare(
    input: &Comparison<'_>,
    name: &str,
    old: Option<&Source>,
    new: Option<&Source>,
) -> io::Result<Vec<proof::Proof>> {
    let path = input.root.join(input.directory).join(name);
    let mut proofs = old
        .into_iter()
        .chain(new)
        .filter_map(|source| source.proof.clone())
        .collect::<Vec<_>>();
    let Some(mode) = detector(input, &path)? else {
        return Ok(proofs);
    };
    let filename = path.to_str().ok_or_else(|| invalid("merge dependency source encoding"))?;
    let left = scan(filename, old)?;
    let right = scan(filename, new)?;
    if left
        .as_object()
        .map(|map| map.iter().collect::<Vec<_>>())
        != right
            .as_object()
            .map(|map| map.iter().collect::<Vec<_>>())
    {
        return Err(invalid("merge dependency graph changed"));
    }
    for dependency in left
        .as_object()
        .ok_or_else(|| invalid("merge dependency detector output"))?
        .keys()
    {
        resolve(input, &path, mode, dependency)?;
    }
    // Config and package classification are control inputs even for dependency-free additions.
    for name in ["package.json", "component.json"] {
        proof::read(&input.root.join(input.directory).join(name), &mut proofs)?;
    }
    Ok(proofs)
}
fn detector(input: &Comparison<'_>, path: &Path) -> io::Result<Option<&'static str>> {
    if matches!(
        path.file_name().and_then(|name| name.to_str()),
        Some("package.json" | "component.json"),
    ) {
        return Err(invalid("merge dependency control file source"));
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if matches!(extension, "ts" | "tsx" | "mts" | "cts") {
        if !input.typescript {
            return Err(invalid("merge dependency TypeScript version"));
        }
        return Ok(Some("typescript5.9"));
    }
    if matches!(extension, "js" | "jsx" | "mjs" | "cjs") {
        return Ok(Some("commonjs"));
    }
    if input.detectors.contains(format!(".{extension}").as_str()) {
        return Err(invalid("merge dependency unsupported detector"));
    }
    Ok(None)
}
fn resolve(input: &Comparison<'_>, path: &Path, mode: &str, dependency: &str) -> io::Result<()> {
    if input.topology_changed && dependency.starts_with('.') {
        return Err(invalid("merge dependency changed relative resolution candidates"));
    }
    if input.builtins.contains(dependency)
        || dependency.starts_with("http://")
        || dependency.starts_with("https://")
    {
        return Ok(());
    }
    let resolved = resolve_one(
        dependency,
        path.parent().ok_or_else(|| invalid("merge dependency parent"))?,
        Some(input.home),
        input.budget,
        mode,
    )?
    .ok_or_else(|| invalid("merge dependency unresolved import"))?;
    if dependency.starts_with('.')
        && !Path::new(&resolved).starts_with(input.root.join(input.directory))
    {
        return Err(invalid("merge dependency cross component import"));
    }
    Ok(())
}
fn scan(filename: &str, source: Option<&Source>) -> io::Result<Value> {
    let Some(source) = source else {
        return Ok(serde_json::json!({}));
    };
    let text = String::from_utf8(source.bytes.clone())
        .map_err(|_| invalid("merge dependency source UTF8"))?;
    let output =
        bit_dependency_scanner::scan_source(filename.to_owned(), text).map_err(io::Error::other)?;
    if output["status"] != "ok" {
        return Err(invalid("merge dependency detector declined"));
    }
    Ok(output["dependencies"].clone())
}

fn strings(value: &Value) -> io::Result<HashSet<&str>> {
    let values = value
        .as_array()
        .filter(|values| values.len() <= 4096)
        .ok_or_else(|| invalid("merge dependency grammar"))?;
    values
        .iter()
        .map(|value| {
            value
                .as_str()
                .filter(|value| value.len() <= 4096)
                .ok_or_else(|| invalid("merge dependency grammar string"))
        })
        .collect()
}
