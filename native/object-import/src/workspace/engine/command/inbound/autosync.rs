//! Publish the independent bitmap-auto-sync startup lifecycle.

use super::super::{State, bitmap, repository::Repository};
use crate::workspace::engine::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{fs, io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    token: String,
    git_head: String,
    bitmap_history_file_id: String,
    ids: Vec<String>,
}

pub(in crate::workspace::engine) fn finalize(
    input: &Request,
    state: &State,
) -> io::Result<(usize, Value)> {
    bitmap::validate_history_file_id(&input.bitmap_history_file_id)?;
    let retained = state.inbound.as_ref().ok_or_else(|| invalid("auto-sync inbound missing"))?;
    if retained.token != input.token {
        return Err(invalid("auto-sync inbound token"));
    }
    let mut repository = Repository::new(&input.root, None);
    let mut updates = Vec::new();
    for id in &input.ids {
        let model = match retained.import.overlay
            .models()
            .into_iter()
            .find(|model| identity(model) == *id)
        {
            Some(model) => model.clone(),
            None => match repository.read(&hash(id.as_bytes()), "Component") {
                Ok(model) => model,
                Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error),
            },
        };
        if let Some(version) = head(&model) {
            updates.push((id.clone(), version));
        }
    }
    let (bitmap, count) = bitmap::auto_sync(&input.root, &updates)?;
    bitmap.validate()?;
    repository.validate()?;
    retained.import.validate()?;
    retained.import.commit()?;
    bitmap.commit(&input.bitmap_history_file_id, "bitmapAutoSync: reconciled with scope HEAD")?;
    let path = input.root.join(".bit/last-pull-sync");
    fs::create_dir_all(path.parent().ok_or_else(|| invalid("auto-sync sentinel parent"))?)?;
    fs::write(path, &input.git_head)?;
    Ok((count, json!({"synced":count})))
}

fn identity(model: &Value) -> String {
    format!(
        "{}/{}",
        model["scope"].as_str().unwrap_or_default(),
        model["name"].as_str().unwrap_or_default(),
    )
}
fn head(model: &Value) -> Option<String> {
    let head = model["head"]
        .as_str()
        .filter(|head| !head.is_empty() && *head != "0")?;
    Some(
        model["versions"]
            .as_object()
            .and_then(|versions| {
                versions
                    .iter()
                    .rev()
                    .find(|(_, value)| value.as_str() == Some(head))
            })
            .map_or_else(|| head.to_owned(), |(tag, _)| tag.clone()),
    )
}
