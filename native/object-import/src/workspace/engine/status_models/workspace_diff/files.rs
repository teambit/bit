use super::{Budgets, Request, capture::File, invalid};
use crate::{checkout::repository, read_budget::Budget, workspace::engine::diff};
use rayon::prelude::*;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    io,
};

pub(super) fn read(
    request: &Request,
    current: Vec<File>,
    model: Option<&Value>,
    budgets: &Budgets,
) -> io::Result<Vec<Value>> {
    let (order, mut current) = current_sources(current)?;
    let models = model_files(model)?;
    let bodies = model_sources(request, models, (&budgets.raw, &budgets.packed))?;
    let mut files = Vec::new();
    for (file, body) in models.iter().zip(bodies) {
        let path = file["relativePath"].as_str().expect("validated model path");
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

type Sources = (Vec<String>, HashMap<String, Vec<u8>>);
fn current_sources(current: Vec<File>) -> io::Result<Sources> {
    let mut order = Vec::new();
    let mut sources = HashMap::new();
    for file in current {
        let path = file.metadata["relativePath"]
            .as_str()
            .ok_or_else(|| invalid("workspace diff source path"))?
            .to_owned();
        order.push(path.clone());
        sources.insert(path, file.contents);
    }
    Ok((order, sources))
}
fn model_files(model: Option<&Value>) -> io::Result<&[Value]> {
    let files = match model {
        Some(model) => model["files"]
            .as_array()
            .ok_or_else(|| invalid("workspace diff model files"))?
            .as_slice(),
        None => &[],
    };
    super::super::super::count(files.len())?;
    let mut seen = HashSet::new();
    for file in files {
        let path =
            file["relativePath"].as_str().ok_or_else(|| invalid("workspace diff model path"))?;
        if !seen.insert(path) || path.len() > 32768 || path.contains('\0') {
            return Err(invalid("workspace diff duplicate or invalid model path"));
        }
    }
    Ok(files)
}
fn model_sources(
    request: &Request,
    files: &[Value],
    budgets: (&Budget, &Budget),
) -> io::Result<Vec<Vec<u8>>> {
    files
        .par_iter()
        .map(|file| {
            let reference =
                file["file"].as_str().ok_or_else(|| invalid("workspace diff source reference"))?;
            let reference = crate::merge_history::hash(reference)?;
            let source = repository::read_source_shared(
                &request.root.join(".bit/objects"),
                reference,
                budgets.0,
                budgets.1,
            )?;
            crate::merge_transaction::reads::source(reference, &source)?;
            Ok(source.body)
        })
        .collect()
}

fn retain(file: Value, output: &Budget) -> io::Result<Value> {
    let patch = file["rawDiff"].as_str().ok_or_else(|| invalid("workspace diff patch"))?;
    output.reserve(patch.len())?;
    Ok(file)
}

#[cfg(test)]
mod tests;
