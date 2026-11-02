//! [`read`] and [`diff`] model and workspace [`File`] contents under [`Budgets`].

#[cfg(test)]
mod tests;

use super::{Budgets, Request, capture::File, invalid};
use crate::{checkout::repository, read_budget::Budget, workspace::engine::diff};
use rayon::prelude::*;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    io,
};

/// Diffs `current` workspace files against stored `model` sources under `budgets`.
pub(super) fn read(
    request: &Request,
    current: Vec<File>,
    model: Option<&Value>,
    budgets: &Budgets,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Vec<Value>> {
    let (order, mut current) = current_sources(current)?;
    let models = model_files(model)?;
    let bodies = model_sources(request, models, (&budgets.raw, &budgets.packed), overlay)?;
    let mut files = Vec::with_capacity(models.len() + order.len());
    for (file, body) in models.iter().zip(bodies) {
        let path = file["relativePath"]
            .as_str()
            .ok_or_else(|| invalid("workspace diff model path"))?
            .trim();
        files.push((path.to_owned(), Some(body), current.remove(path)));
    }
    for path in order {
        if let Some(source) = current.remove(&path) {
            files.push((path, None, Some(source)));
        }
    }
    diff::frozen(files, &request.git_executable, request.color)?
        .into_iter()
        .map(|file| retain(file.without_contents(), &budgets.output))
        .collect()
}

/// Ordered relative paths and raw byte contents for current workspace files.
type Sources = (Vec<String>, HashMap<String, Vec<u8>>);
/// Extracts ordered relative paths and a path-to-bytes lookup map from `current` files.
#[inline]
fn current_sources(current: Vec<File>) -> io::Result<Sources> {
    let mut order = Vec::with_capacity(current.len());
    let mut sources = HashMap::with_capacity(current.len());
    for file in current {
        let path = file.metadata["relativePath"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("workspace diff source path"))?
            .to_owned();
        if sources.insert(path.clone(), file.contents).is_some() {
            return Err(invalid("workspace diff duplicate source path"));
        }
        order.push(path);
    }
    Ok((order, sources))
}
/// Validates and returns the `files` array from `model`, or an empty slice when `model` is `None`.
#[inline]
fn model_files(model: Option<&Value>) -> io::Result<&[Value]> {
    let files = match model {
        Some(model) => model["files"]
            .as_array()
            .ok_or_else(|| invalid("workspace diff model files"))?
            .as_slice(),
        None => &[],
    };
    super::super::super::count(files.len())?;
    let mut seen = HashSet::with_capacity(files.len());
    for file in files {
        let path = file["relativePath"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("workspace diff model path"))?;
        if path.is_empty() || !seen.insert(path) || path.len() > 32768 || path.contains('\0') {
            return Err(invalid("workspace diff duplicate or invalid model path"));
        }
    }
    Ok(files)
}
fn model_sources(
    request: &Request,
    files: &[Value],
    budgets: (&Budget, &Budget),
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Vec<Vec<u8>>> {
    let objects_dir = crate::scope_path(&request.root).join("objects");
    files
        .par_iter()
        .map(|file| {
            let reference = file["file"]
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("workspace diff source reference"))?;
            let digest = crate::merge_history::hash(reference)?;
            let canonical = crate::validate::hexadecimal(&digest);
            if let Some(source) = overlay.and_then(|overlay| overlay.source(&canonical)) {
                budgets.0.reserve(source.len())?;
                overlay.expect("source belongs to overlay").trace_source(&canonical)?;
                return Ok(source.to_vec());
            }
            let source =
                repository::read_source_shared(&objects_dir, digest, budgets.0, budgets.1)?;
            crate::merge_transaction::reads::source(digest, &source)?;
            Ok(source.body)
        })
        .collect()
}

#[inline]
fn retain(file: Value, output: &Budget) -> io::Result<Value> {
    let patch = file["rawDiff"].as_str().ok_or_else(|| invalid("workspace diff patch"))?;
    output.reserve(patch.len())?;
    Ok(file)
}
