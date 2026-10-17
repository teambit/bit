use super::{Candidate, Plan, error, rows};
use serde_json::{Value, json};
use std::io;
pub(super) fn filter(
    plan: &mut Plan,
    candidate: &mut Candidate,
    existing: Option<&Value>,
) -> io::Result<()> {
    existing_root(candidate, existing)?;
    let owned = plan.bitmap
        .as_object()
        .unwrap()
        .iter()
        .filter_map(|(name, row)| {
            Some((
                row["name"]
                    .as_str()
                    .unwrap_or(name)
                    .to_owned(),
                row["rootDir"].as_str()?.to_owned(),
                row.clone(),
            ))
        })
        .collect::<Vec<_>>();
    candidate.files.retain(|file| {
        let owner = owned
            .iter()
            .find(|(name, root, row)| {
                (name != &candidate.name || rows::scope(row) != Some(candidate.scope.as_str()))
                    && root != "."
                    && file.starts_with(&format!("{root}/"))
            });
        if let Some((name, _, row)) = owner {
            warning(&mut plan.warnings, name, row, file);
            false
        } else {
            true
        }
    });
    Ok(())
}

fn existing_root(candidate: &Candidate, existing: Option<&Value>) -> io::Result<()> {
    if let Some(root) = existing.and_then(|row| row["rootDir"].as_str())
        && root != candidate.directory
        && !root.starts_with(&format!("{}/", candidate.directory))
    {
        return Err(error(format!(
            "unable to add individual files outside the root dir ({root}) of {}/{}.\nyou can add the directory these files are located at and it'll change the root dir of the component accordingly",
            candidate.scope, candidate.name,
        )));
    }
    Ok(())
}

fn warning(warnings: &mut Value, name: &str, row: &Value, file: &str) {
    let scope = row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| row["defaultScope"].as_str())
        .unwrap_or_default();
    let key = format!("{scope}/{name}");
    if !warnings["alreadyUsed"][&key].is_array() {
        warnings["alreadyUsed"][&key] = json!([]);
    }
    warnings["alreadyUsed"][&key]
        .as_array_mut()
        .unwrap()
        .push(json!(file));
}
