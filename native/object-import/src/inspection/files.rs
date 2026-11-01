use super::{invalid, read, wire};
use serde_json::{Value, json};
use std::{collections::HashMap, io};
pub(super) fn plan(input: Value, plans: &super::Plans) -> io::Result<Value> {
    let request: wire::Files = serde_json::from_value(input).map_err(io::Error::other)?;
    if request.token.trim().is_empty() {
        return Err(invalid("stale inspection token"));
    }
    let files = plans.get(request.token.trim()).ok_or_else(|| invalid("stale inspection token"))?;
    let mut models = validated_models(&request.model_files)?;
    let mut statuses = Vec::with_capacity(files.len() + request.model_files.len());
    let mut any_changed = files.len() != request.model_files.len();
    for file in files.iter() {
        let status = match models.remove(&file.relative_path) {
            None => "new",
            Some(model) if model.normalized_hash().eq_ignore_ascii_case(file.linux_hash.trim()) => {
                "unchanged"
            }
            Some(_) => "modified",
        };
        any_changed |= status != "unchanged";
        statuses.push(json!({"relativePath":file.relative_path,"status":status}));
    }
    for model in &request.model_files {
        if models.contains_key(&model.relative_path) {
            any_changed = true;
            statuses.push(json!({"relativePath":model.relative_path,"status":"deleted"}));
        }
    }
    Ok(json!({"modified":!request.model_files.is_empty() && any_changed,"statuses":statuses}))
}

pub(super) fn validated_models(
    files: &[wire::Model],
) -> io::Result<HashMap<&String, &wire::Model>> {
    if files.len() > super::MAX_FILES {
        return Err(invalid("inspection model file budget"));
    }
    let mut models = HashMap::with_capacity(files.len());
    for model in files {
        if model.relative_path.trim() != model.relative_path {
            return Err(invalid("inspection unsafe relative path"));
        }
        read::relative(&model.relative_path)?;
        crate::merge_history::hash(model.normalized_hash())?;
        if models.insert(&model.relative_path, model).is_some() {
            return Err(invalid("duplicate model path"));
        }
    }
    Ok(models)
}
