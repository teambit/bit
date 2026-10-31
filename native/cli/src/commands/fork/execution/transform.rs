use super::{Results, bitmap};
use crate::commands::{
    add::ProjectedLinker,
    fork::{inventory, options::Options},
};
use bit_object_import::component_fork::{self, Plan, Refactor};
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};
pub(super) fn source(
    root: &Path,
    options: &component_fork::Options,
    row: &Value,
    plan: &mut Plan,
    linker: &mut ProjectedLinker,
) -> io::Result<()> {
    let source =
        non_empty_str(&row["identity"]).ok_or_else(|| io::Error::other("fork source identity"))?;
    let target = plan.target_identity().to_owned();
    let inputs = plan.ast_inputs();
    let source_short = source
        .rsplit('/')
        .next()
        .unwrap_or(source);
    let target_short = target
        .rsplit('/')
        .next()
        .unwrap_or(target.as_str());
    let outputs = ast(
        root,
        linker,
        &inputs,
        &[(source.into(), target.clone())],
        Some((source_short, target_short)),
        !options.preserve && row["refactorVariables"] != false,
    )?;
    for (path, bytes) in outputs {
        plan.transformed(&path, bytes)?;
    }
    Ok(())
}
pub(super) fn local(
    root: &Path,
    _options: &Options,
    linker: &mut ProjectedLinker,
    output: &bit_install::output::Output,
    facts: &Value,
    target: &str,
) -> io::Result<()> {
    let state = inventory::read(root)?;
    let target = inventory::selected(&state, target)
        .ok_or_else(|| io::Error::other("fork target inventory"))?;
    let old = non_empty_str(&facts["packageName"])
        .ok_or_else(|| io::Error::other("fork original package"))?;
    let new = non_empty_str(&target["packageName"])
        .ok_or_else(|| io::Error::other("fork target package"))?;
    let rows = load(root, linker, output)?;
    Refactor::prepare(root, &rows, &[(old.into(), new.into())], true, false)?.apply()
}
pub(super) fn multiple(
    root: &Path,
    options: &Options,
    linker: &mut ProjectedLinker,
    output: &bit_install::output::Output,
    results: &Results,
) -> io::Result<()> {
    let pairs = replacements(root, results)?;
    let rows = load(root, linker, output)?;
    if options.scope_fork || options.flags.refactor {
        apply_replacements(root, linker, &rows, &pairs, options.flags.ast)?;
    }
    Ok(())
}
fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn replacements(root: &Path, results: &Results) -> io::Result<Vec<(String, String)>> {
    let state = inventory::read(root)?;
    let mut pairs = Vec::new();
    for (id, facts) in results.ids.iter().zip(&results.facts) {
        let target =
            inventory::selected(&state, id).ok_or_else(|| io::Error::other("fork batch target"))?;
        let source_pkg = non_empty_str(&facts["packageName"])
            .ok_or_else(|| io::Error::other("fork source package name"))?;
        let target_pkg = non_empty_str(&target["packageName"])
            .ok_or_else(|| io::Error::other("fork target package name"))?;
        pairs.push((source_pkg.to_owned(), target_pkg.to_owned()));
        pairs.push((source_identity(&facts["sourceId"])?, id.clone()));
    }
    Ok(pairs)
}
fn source_identity(source: &Value) -> io::Result<String> {
    if let Some(raw) = non_empty_str(source) {
        let bare = raw.rsplit_once('@').map_or(raw, |(bare, _)| bare.trim());
        if !bare.is_empty() {
            return Ok(bare.to_owned());
        }
    }
    let scope =
        non_empty_str(&source["scope"]).ok_or_else(|| io::Error::other("fork source scope"))?;
    let name = non_empty_str(&source["name"]).ok_or_else(|| io::Error::other("fork source name"))?;
    Ok(format!("{scope}/{name}"))
}
fn apply_replacements(
    root: &Path,
    linker: &mut ProjectedLinker,
    rows: &[Value],
    pairs: &[(String, String)],
    use_ast: bool,
) -> io::Result<()> {
    let mut plan = Refactor::prepare(root, rows, pairs, false, use_ast)?;
    if use_ast {
        for (path, bytes) in ast(root, linker, &plan.ast_inputs(), pairs, None, false)? {
            plan.transformed(&path, bytes)?;
        }
        // Published refactorMultipleAndInstall always runs its variable pass,
        // including an empty replacement list; the AST printer remains observable.
        for (path, bytes) in ast(root, linker, &plan.ast_inputs(), &[], None, false)? {
            plan.transformed(&path, bytes)?;
        }
    }
    plan.apply()?;
    Ok(())
}
fn load(
    root: &Path,
    linker: &mut ProjectedLinker,
    output: &bit_install::output::Output,
) -> io::Result<Vec<Value>> {
    let bitmap = bitmap(root)?;
    let state = inventory::read(root)?;
    let ids = state["components"]
        .as_array()
        .ok_or_else(|| io::Error::other("fork inventory components"))?
        .iter()
        .map(|row| {
            non_empty_str(&row["identity"])
                .map(str::to_owned)
                .ok_or_else(|| io::Error::other("fork inventory component identity"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    output.status(&format!("loading {} component(s)", ids.len()));
    let rows = linker.capture_cached(root, &bitmap, &ids)?;
    print!("{}", linker.take_stdout());
    Ok(rows)
}
fn ast(
    root: &Path,
    linker: &mut ProjectedLinker,
    inputs: &[(PathBuf, Vec<u8>)],
    pairs: &[(String, String)],
    names: Option<(&str, &str)>,
    variables: bool,
) -> io::Result<Vec<(PathBuf, Vec<u8>)>> {
    let spool = tempfile::Builder::new().prefix("bit-fork-ast-").tempdir()?;
    let mut files = Vec::new();
    for (index, (path, bytes)) in inputs.iter().enumerate() {
        let stored = spool.path().join(index.to_string());
        fs::write(&stored, bytes)?;
        files.push(json!({"spool":stored,"filename":path}));
    }
    linker.call(root,"forkAst",&json!({"files":files,"pairs":pairs,"sourceName":names.map(|(source,_)|source),"targetName":names.map(|(_,target)|target),"variables":variables}))?;
    print!("{}", linker.take_stdout());
    inputs
        .iter()
        .enumerate()
        .map(|(index, (path, _))| {
            let stored = spool.path().join(index.to_string());
            if !fs::symlink_metadata(&stored)?.is_file()
                || fs::metadata(&stored)?.len() > 32 * 1024 * 1024
            {
                return Err(io::Error::other("fork AST source limit"));
            }
            Ok((path.clone(), fs::read(stored)?))
        })
        .collect()
}
