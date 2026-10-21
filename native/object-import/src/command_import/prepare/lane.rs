mod fetch;
mod history;

use super::{PreparedImport, Target, invalid, read_model, receive, remote};
use crate::command_import::lane::{Id, Record, entries};
use std::{collections::HashSet, io, path::Path};

impl PreparedImport {
    pub(crate) fn prepare_lane_objects(
        &mut self,
        scope: &str,
        hashes: &[String],
        kind: &str,
        reason: Option<&str>,
    ) -> io::Result<()> {
        self.prepare_lane_missing_objects(scope, hashes, kind, reason)
            .map(|_| ())
    }
    pub(crate) fn prepare_lane_missing_objects(
        &mut self,
        scope: &str,
        hashes: &[String],
        kind: &str,
        reason: Option<&str>,
    ) -> io::Result<Vec<String>> {
        if hashes.len() > 4096
            || !matches!(kind, "Version" | "Source")
            || reason.is_some_and(|reason| reason.len() > 4096)
        {
            return Err(invalid("lane missing object request"));
        }
        let missing = missing_objects(self, hashes)?;
        if missing.is_empty() {
            return Ok(missing);
        }
        let remotes = self.environment.remotes.clone();
        let directory = super::remote::raw_remote(self, &remotes, scope)?;
        self.progress.push(super::super::Progress {
            object_request: true,
            reason: reason.map(str::to_owned),
            ids: missing.clone(),
            ..Default::default()
        });
        if kind == "Source" {
            for (hash, object) in self.capture.sources(&directory, &missing)? {
                self.overlay.objects.insert(hash, object);
            }
        } else {
            for hash in &missing {
                let object = self.capture
                    .object(&directory, hash, kind)?
                    .ok_or_else(|| invalid("lane requested object missing"))?;
                self.overlay.objects.insert(hash.clone(), object);
            }
        }
        self.progress
            .last_mut()
            .unwrap()
            .objects
            .extend(missing.iter().cloned());
        self.validate()?;
        Ok(missing)
    }
    pub(crate) fn refresh_lane_main(&mut self, identities: &[String]) -> io::Result<()> {
        if identities.len() > 4096 {
            return Err(invalid("lane main import budget"));
        }
        self.progress.push(super::super::Progress::default());
        for identity in identities {
            self.refresh_main_identity(identity)?;
        }
        self.validate()
    }
    fn refresh_main_identity(&mut self, identity: &str) -> io::Result<()> {
        let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("lane main scope"))?;
        if scope == self.environment.local_scope {
            return Ok(());
        }
        let target =
            Target { scope: Some(scope.into()), name: name.into(), version: "latest".into() };
        let remotes = self.environment.remotes.clone();
        let directory = remote(self, &remotes, scope)?;
        self.progress
            .last_mut()
            .ok_or_else(|| invalid("lane main progress"))?
            .ids
            .push(format!("{identity}@latest"));
        // The fetch stream includes ScopeMeta even when ignoreMissingHead omits the model.
        self.progress
            .last_mut()
            .unwrap()
            .objects
            .insert(super::super::object_hash(scope));
        let Some(model) = read_model(self, &directory, &target)? else { return Ok(()) };
        let Some(head) = model["head"].as_str() else { return Ok(()) };
        let local = self.environment.local_directory.clone();
        if super::read_model(self, &local, &target)?
            .as_ref()
            .is_some_and(|stored| stored["head"] == head)
            && super::read_version(self, head)?.is_some()
        {
            self.progress
                .last_mut()
                .unwrap()
                .components
                .insert(identity.to_owned());
            super::transfer::merge_model(self, &target, &model, true)?;
            super::transfer::record_remote_head(self, &target, &model)?;
            return Ok(());
        }
        receive(self, &directory, &target, &model, head, true)?;
        Ok(())
    }
}

fn receive_prefer_graph(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
    visited: &mut HashSet<String>,
) -> io::Result<()> {
    let key = format!("{}@{}", super::identity(target)?, target.version);
    if !visited.insert(key.clone()) {
        return Ok(());
    }
    let hash = receive_counted(plan, directory, target, key)?;
    let version =
        super::read_version(plan, &hash)?.ok_or_else(|| invalid("lane fetched Version absent"))?;
    if super::dependencies::has_edges(plan, &version)? {
        return Ok(());
    }
    for dependency in version["flattenedDependencies"]
        .as_array()
        .ok_or_else(|| invalid("lane flattened dependencies"))?
    {
        receive_closure(
            plan,
            directory,
            &super::dependencies::dependency_target(dependency)?,
            visited,
        )?;
    }
    Ok(())
}

pub(super) fn receive_closure(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
    visited: &mut HashSet<String>,
) -> io::Result<()> {
    let identity = super::identity(target)?;
    let key = format!("{identity}@{}", target.version);
    if !visited.insert(key.clone()) {
        return Ok(());
    }
    if visited.len() > 4096 {
        return Err(invalid("lane import closure budget"));
    }
    let hash = receive_counted(plan, directory, target, key)?;
    let version =
        super::read_version(plan, &hash)?.ok_or_else(|| invalid("lane fetched Version absent"))?;
    for dependency in version["flattenedDependencies"]
        .as_array()
        .ok_or_else(|| invalid("lane flattened dependencies"))?
    {
        let target = super::dependencies::dependency_target(dependency)?;
        if !local_version(plan, &target)? {
            receive_closure(plan, directory, &target, visited)?;
        }
    }
    Ok(())
}

/// Receive one Version of the lane. `importMany` re-fetches a version it has
/// locally only while it is not built, once per process
/// (`cacheUnBuiltIds`), and the remote returns nothing for a version it was
/// given: such a version is not counted as imported.
fn receive_counted(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
    key: String,
) -> io::Result<String> {
    let incoming = read_model(plan, directory, target)?
        .ok_or_else(|| invalid("lane remote component missing"))?;
    let hash = super::version_ref(&incoming, &target.version)?;
    let present = local_version(plan, target)?;
    let row = plan.progress.last_mut().unwrap();
    row.ids.push(key.clone());
    let counted = (row.components.clone(), row.objects.clone());
    if present && plan.cache.switch_existing_versions {
        // sources.getMany(..., true) primes cacheUnBuiltIds before the lane fetch.
        plan.cache.unbuilt.insert(key);
        return Ok(hash);
    }
    if present {
        plan.cache.unbuilt.insert(key);
    }
    receive(plan, directory, target, &incoming, &hash, true)?;
    if present {
        let row = plan.progress.last_mut().unwrap();
        (row.components, row.objects) = counted;
    }
    Ok(hash)
}

/// Whether the local scope has the target's Version.
fn local_version(plan: &mut PreparedImport, target: &Target) -> io::Result<bool> {
    let local = plan.environment.local_directory.clone();
    let model = read_model(plan, &local, target)?;
    let reference = model
        .as_ref()
        .map(|model| super::version_ref(model, &target.version))
        .transpose()?;
    Ok(reference
        .map(|hash| super::read_version(plan, &hash))
        .transpose()?
        .flatten()
        .is_some())
}

impl PreparedImport {
    /// Resulting main-head Versions, in canonical successfully-merged ID order.
    /// Fetch only non-head same-scope snaps and their export-required Sources.
    pub(crate) fn prepare_lane_referenced(
        &mut self,
        scope: &str,
        heads: &[(String, serde_json::Value)],
    ) -> io::Result<()> {
        if heads.len() > 4096 {
            return Err(invalid("lane referenced component budget"));
        }
        let mut checked = HashSet::new();
        let candidates = referenced_candidates(heads, &mut checked)?;
        let missing = self.prepare_lane_missing_objects(scope, &candidates, "Version", None)?;
        let mut sources = Vec::new();
        for hash in missing {
            let value = self.lane_version(&hash)?;
            for reference in referenced_sources(&value)? {
                if checked.insert(reference.clone()) {
                    sources.push(reference);
                }
            }
            if sources.len() > 4096 {
                return Err(invalid("lane referenced Source budget"));
            }
        }
        self.prepare_lane_objects(scope, &sources, "Source", None)
    }
}
fn referenced_sources(version: &serde_json::Value) -> io::Result<Vec<String>> {
    let mut references = Vec::new();
    if let Some(files) = version
        .get("files")
        .filter(|files| !files.is_null())
    {
        for file in files.as_array().ok_or_else(|| invalid("lane referenced files"))? {
            references.push(
                file["file"]
                    .as_str()
                    .ok_or_else(|| invalid("lane referenced Source"))?
                    .to_owned(),
            );
        }
    }
    for field in ["flattenedEdgesRef", "dependenciesGraphRef"] {
        if let Some(reference) = version
            .get(field)
            .filter(|reference| !reference.is_null())
        {
            references.push(
                reference
                    .as_str()
                    .ok_or_else(|| invalid("lane referenced graph"))?
                    .to_owned(),
            );
        }
    }
    for reference in &references {
        crate::merge_history::hash(reference)?;
    }
    Ok(references)
}

fn missing_objects(plan: &mut PreparedImport, hashes: &[String]) -> io::Result<Vec<String>> {
    let mut missing = Vec::new();
    let mut seen = HashSet::new();
    for hash in hashes {
        crate::merge_history::hash(hash)?;
        if !seen.insert(hash) || plan.overlay.objects.contains_key(hash) {
            continue;
        }
        let file = plan.environment.local_directory
            .join(&hash[..2])
            .join(&hash[2..]);
        if plan.capture.read(&file)?.is_none() {
            missing.push(hash.clone());
        }
    }
    Ok(missing)
}

pub(super) fn remote_lane_hash(
    plan: &mut PreparedImport,
    directory: &Path,
    id: &Id,
) -> io::Result<String> {
    let index = plan.capture
        .json(
            &directory
                .parent()
                .ok_or_else(|| invalid("lane remote directory"))?
                .join("index.json"),
        )?
        .unwrap_or_else(|| serde_json::json!({"lanes":[]}));
    let rows = index["lanes"].as_array().ok_or_else(|| invalid("lane remote index"))?;
    let matches = rows
        .iter()
        .filter(|row| row["id"]["scope"] == id.scope && row["id"]["name"] == id.name)
        .collect::<Vec<_>>();
    if matches.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!(r#"lane "{}" was not found in scope "{}""#, id.name, id.scope),
        ));
    }
    if matches.len() != 1 {
        return Err(invalid("lane remote identity missing or ambiguous"));
    }
    let hash = matches[0]["hash"]
        .as_str()
        .ok_or_else(|| invalid("lane remote hash"))?
        .to_owned();
    Ok(hash)
}

fn referenced_candidates(
    heads: &[(String, serde_json::Value)],
    checked: &mut HashSet<String>,
) -> io::Result<Vec<String>> {
    let mut candidates = Vec::new();
    for (identity, version) in heads {
        extend_candidates(identity, version, checked, &mut candidates)?;
    }
    Ok(candidates)
}

fn extend_candidates(
    identity: &str,
    version: &serde_json::Value,
    checked: &mut HashSet<String>,
    candidates: &mut Vec<String>,
) -> io::Result<()> {
    let component_scope =
        identity.split_once('/').ok_or_else(|| invalid("lane referenced identity"))?.0;
    for value in version["flattenedDependencies"]
        .as_array()
        .ok_or_else(|| invalid("lane referenced dependencies"))?
    {
        let dependency = super::dependencies::dependency_target(value)?;
        if dependency.scope.as_deref() != Some(component_scope)
            || crate::merge_history::hash(&dependency.version).is_err()
        {
            continue;
        }
        if checked.insert(dependency.version.clone()) {
            candidates.push(dependency.version);
        }
        if candidates.len() > 4096 {
            return Err(invalid("lane referenced Version budget"));
        }
    }
    Ok(())
}
