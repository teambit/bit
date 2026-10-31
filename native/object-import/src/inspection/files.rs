use super::{invalid, read, wire};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
};
pub(super) fn plan(input: Value, plans: &super::Plans) -> io::Result<Value> {
    let request: wire::Files = serde_json::from_value(input).map_err(io::Error::other)?;
    let token = request.token.trim();
    if token.is_empty() {
        return Err(invalid("stale inspection token"));
    }
    let files = plans.get(token).ok_or_else(|| invalid("stale inspection token"))?;
    let models = validated_models(&request.model_files)?;
    let mut statuses = Vec::new();
    let mut current = HashSet::new();
    for file in files.iter() {
        current.insert(&file.relative_path);
        let status = match models.get(&file.relative_path) {
            None => "new",
            Some(model) if model.normalized_hash().eq_ignore_ascii_case(file.linux_hash.trim()) => {
                "unchanged"
            }
            Some(_) => "modified",
        };
        statuses.push(json!({"relativePath":file.relative_path,"status":status}));
    }
    for model in &request.model_files {
        if !current.contains(&model.relative_path) {
            statuses.push(json!({"relativePath":model.relative_path,"status":"deleted"}));
        }
    }
    let modified = !request.model_files.is_empty()
        && (files.len() != request.model_files.len()
            || statuses
                .iter()
                .any(|row| row["status"] != "unchanged"));
    Ok(json!({"modified":modified,"statuses":statuses}))
}

pub(super) fn validated_models(
    files: &[wire::Model],
) -> io::Result<HashMap<&String, &wire::Model>> {
    if files.len() > super::MAX_FILES {
        return Err(invalid("inspection model file budget"));
    }
    let mut models = HashMap::new();
    for model in files {
        read::relative(&model.relative_path)?;
        crate::merge_history::hash(model.normalized_hash())?;
        if models.insert(&model.relative_path, model).is_some() {
            return Err(invalid("duplicate model path"));
        }
    }
    Ok(models)
}
