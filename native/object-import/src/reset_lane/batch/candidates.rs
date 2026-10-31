//! Discover staged models in scope-index order before selectors or replacement planning.
#[cfg(test)]
mod tests;
use super::super::{
    BitmapState, ObjectChange, Repository, bitmap_key, diagnostics, history, indexed_hash, invalid,
    proofs, selection,
};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Discovery {
    pub(super) identities: Vec<String>,
    pub(super) population: Vec<ObjectChange>,
    pub(super) proofs: proofs::ReadSet,
    objects: PathBuf,
}

impl Discovery {
    pub(super) fn failure(&self, error: io::Error) -> io::Error {
        diagnostics::with_population(
            error,
            &self.objects,
            self.population.clone(),
            self.proofs.clone(),
        )
    }
}

pub(super) fn prepare(root: &Path) -> io::Result<Discovery> {
    let bitmap = context(root)?;
    let mut retained = vec![(root.join(".bitmap"), Some(bitmap.before.clone()))];
    let index_bytes = proofs::read(&crate::scope_path(root).join("index.json"), &mut retained)?
        .ok_or_else(|| invalid("lane candidate index absent"))?;
    let index: Value = serde_json::from_slice(&index_bytes)?;
    let hash = indexed_hash(&index, "lanes", &bitmap.lane_scope, &bitmap.lane_name)?;
    let objects = crate::scope_path(root).join("objects");
    let lane = proofs::object(&objects, &hash, "Lane", &mut retained)?;
    let membership = membership(&lane)?;
    let identities = ordered(&index, &membership)?;
    let mut result =
        Discovery { identities: Vec::new(), population: Vec::new(), proofs: retained, objects };
    for identity in identities {
        let repository = staged_repository(root, &identity)?;
        if staged(&repository, &mut result)? {
            result.identities.push(identity);
        }
    }
    proofs::verify(&result.proofs)?;
    Ok(result)
}

fn staged_repository(root: &Path, identity: &str) -> io::Result<Repository> {
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("lane candidate identity"))?;
    let mut bitmap = context(root)?;
    bitmap.key = bitmap_key(
        bitmap.document.as_object().ok_or_else(|| invalid("lane candidate bitmap"))?,
        scope,
        name,
    )
    .unwrap_or_default();
    Repository::staged(root, &bitmap, scope, name)
}

fn staged(repository: &Repository, result: &mut Discovery) -> io::Result<bool> {
    if repository.heads.baseline.as_deref() == Some(repository.heads.current.as_str()) {
        return Ok(false);
    }
    let mut heads = vec![repository.heads.current.clone()];
    heads.extend(repository.heads.baseline.iter().cloned());
    let population = history::populations_for(repository, &heads)?;
    let distance = selection::distance(repository, &repository.heads.current)?;
    result.proofs.extend(proofs::capture_heads(repository, &heads)?);
    result.population.extend(population);
    Ok(!distance["sourceOnly"]
        .as_array()
        .ok_or_else(|| invalid("lane staged divergence"))?
        .is_empty())
}

fn membership(lane: &Value) -> io::Result<HashSet<String>> {
    let mut ids = HashSet::new();
    for row in lane["components"].as_array().ok_or_else(|| invalid("lane candidate rows"))? {
        ids.insert(identity(&row["id"])?);
    }
    for row in lane["updateDependents"]
        .as_array()
        .into_iter()
        .flatten()
    {
        let (id, _) = row
            .as_str()
            .and_then(|row| row.rsplit_once('@'))
            .ok_or_else(|| invalid("lane candidate hidden identity"))?;
        ids.insert(id.to_owned());
    }
    Ok(ids)
}

fn ordered(index: &Value, membership: &HashSet<String>) -> io::Result<Vec<String>> {
    let mut ids = Vec::new();
    for row in index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("lane candidate index"))?
    {
        if row["isSymlink"] == true {
            continue;
        }
        if let Some(id) = matching_member_id(&row["id"], membership)?
            && !ids.contains(&id)
        {
            ids.push(id);
        }
    }
    if ids.len() != membership.len() {
        return Err(invalid("lane candidate unindexed membership"));
    }
    // Removed-staged visible rows are already included. reset-component.getComponentsWithOptionToUntag
    // appends only missing IDs, so these rows retain their original scope-list position.
    Ok(ids)
}

fn matching_member_id(id: &Value, membership: &HashSet<String>) -> io::Result<Option<String>> {
    let name = id["name"].as_str().ok_or_else(|| invalid("lane candidate name"))?;
    if let Some(scope) = id["scope"]
        .as_str()
        .filter(|val| !val.is_empty())
    {
        let candidate = format!("{scope}/{name}");
        return Ok(membership.contains(&candidate).then_some(candidate));
    }
    let suffix = format!("/{name}");
    Ok(membership
        .iter()
        .find(|member| member.ends_with(&suffix))
        .cloned())
}

fn identity(id: &Value) -> io::Result<String> {
    Ok(format!(
        "{}/{}",
        id["scope"].as_str().ok_or_else(|| invalid("lane candidate scope"))?,
        id["name"].as_str().ok_or_else(|| invalid("lane candidate name"))?,
    ))
}

fn context(root: &Path) -> io::Result<BitmapState> {
    let before = fs::read(root.join(".bitmap"))?;
    let document = crate::recovery::jsonc::parse(&before)?;
    let lane = &document["_bit_lane"];
    let lane_scope = lane["id"]["scope"]
        .as_str()
        .ok_or_else(|| invalid("lane candidate scope"))?
        .to_owned();
    let lane_name = lane["id"]["name"]
        .as_str()
        .ok_or_else(|| invalid("lane candidate name"))?
        .to_owned();
    let exported = lane["exported"].as_bool().ok_or_else(|| invalid("lane candidate exported"))?;
    Ok(BitmapState {
        before,
        document,
        key: String::new(),
        lane_scope,
        lane_name,
        exported,
        staged_config: None,
        restored: false,
    })
}
