mod read;

use super::{invalid, read::File, wire};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::PathBuf,
};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    token: String,
    objects_directory: PathBuf,
    model_files: Vec<wire::Model>,
    git_executable: String,
    color: bool,
}
pub(super) fn plan(input: Value, plans: &HashMap<String, Vec<File>>) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    let current = plans.get(&request.token).ok_or_else(|| invalid("stale inspection token"))?;
    if !request.objects_directory.is_absolute() || request.model_files.len() > super::MAX_FILES {
        return Err(invalid("inspection diff path/budget"));
    }
    let mut files = Vec::new();
    let mut seen = HashSet::new();
    let total = current
        .iter()
        .map(|file| file.contents.len())
        .sum::<usize>();
    for model in &request.model_files {
        super::read::relative(&model.relative_path)?;
        crate::merge_history::hash(&model.hash)?;
        if !seen.insert(model.relative_path.clone()) {
            return Err(invalid("duplicate inspection diff model path"));
        }
    }
    let bodies =
        read::load(&request.objects_directory, &request.model_files, super::MAX_BYTES - total)?;
    let by_path: HashMap<_, _> = current
        .iter()
        .map(|file| (&file.relative_path, file))
        .collect();
    for (model, body) in request.model_files.into_iter().zip(bodies) {
        let right = by_path.get(&model.relative_path).map(|file| file.contents.clone());
        files.push((model.relative_path, Some(body), right));
    }
    for file in current {
        if seen.insert(file.relative_path.clone()) {
            files.push((file.relative_path.clone(), None, Some(file.contents.clone())));
        }
    }
    Ok(
        json!({"files":crate::workspace::engine::diff::frozen(files,&request.git_executable,request.color)?}),
    )
}
