use super::{
    PreparedImport, Target, identity, invalid, object_hash, read_model, read_version, receive,
    remote, version_ref,
};
use serde_json::{Value, json};
use std::{io, path::Path};
impl PreparedImport {
    /// Checkout head's includeUnexported/cache=false synchronization. Locally
    /// owned scopes are a genuine no-op; explicit file remotes are fetched anew.
    pub(crate) fn sync_unexported(
        &mut self,
        global_remotes_file: &Path,
        targets: &[Target],
    ) -> io::Result<()> {
        if targets.len() > 4096 {
            return Err(invalid("import unexported count"));
        }
        let external = targets
            .iter()
            .filter(|target| {
                target.scope
                    .as_deref()
                    .is_some_and(|scope| scope != self.environment.local_scope)
            })
            .cloned()
            .collect::<Vec<_>>();
        if external.is_empty() {
            return Ok(());
        }
        let remotes = self.sync_remotes(global_remotes_file)?;
        self.progress.push(super::super::Progress {
            reason: Some(
                "for making sure the new components are really new and are not out-of-sync".into(),
            ),
            ..Default::default()
        });
        for target in external {
            let directory = remote(
                self,
                &remotes,
                target.scope.as_deref().ok_or_else(|| invalid("import unexported scope"))?,
            )?;
            let incoming = read_model(self, &directory, &target)?
                .ok_or_else(|| invalid("import unexported remote missing"))?;
            let hash = version_ref(&incoming, "latest")?;
            let progress =
                self.progress.last_mut().ok_or_else(|| invalid("import unexported progress"))?;
            progress.ids.push(format!("{}@latest", identity(&target)?));
            progress.objects.insert(object_hash(target.scope.as_deref().unwrap_or_default()));
            receive(self, &directory, &target, &incoming, &hash, false)?;
        }
        self.validate()
    }
    fn sync_remotes(&mut self, global_remotes_file: &Path) -> io::Result<Value> {
        let global = self.capture.json(global_remotes_file)?;
        if global.is_none() {
            self.environment.missing_global_remotes = Some(global_remotes_file.to_owned());
        }
        let mut remotes = global.unwrap_or_else(|| json!({}));
        let scope_path = self.environment.local_directory
            .parent()
            .ok_or_else(|| invalid("import scope path"))?
            .join("scope.json");
        let scope =
            self.capture.json(&scope_path)?.ok_or_else(|| invalid("import scope absent"))?;
        let map = remotes.as_object_mut().ok_or_else(|| invalid("import global remotes"))?;
        if let Some(local) = scope["remotes"].as_object() {
            map.extend(local.clone());
        }
        self.environment.remotes = remotes.clone();
        Ok(remotes)
    }
    /// Checkout's cache=true importWithoutDeps stage, after status selection.
    pub(crate) fn prepare_versions(&mut self, targets: &[Target]) -> io::Result<()> {
        self.prepare_versions_with_reason(targets, None)
    }
    pub(crate) fn prepare_diff_versions(&mut self, targets: &[Target]) -> io::Result<()> {
        self.prepare_versions_with_reason(targets, Some("to show diff"))?;
        let ids = self.progress
            .last()
            .ok_or_else(|| invalid("diff import progress"))?
            .ids
            .clone();
        for scope in targets.iter().filter_map(|target| target.scope.as_deref()) {
            if self.environment.remote_overrides.contains_key(scope)
                && ids
                    .iter()
                    .any(|id| id.starts_with(&format!("{scope}/")))
            {
                let hash = object_hash(scope);
                self.overlay.objects
                    .entry(hash.clone())
                    .or_insert(super::super::publish::object(
                        &hash,
                        "ScopeMeta",
                        json!({"name":scope}),
                    )?);
            }
        }
        Ok(())
    }
    pub(crate) fn prepare_merge_gap(&mut self, targets: &[Target]) -> io::Result<()> {
        let reason = self.cache.lane_reason
            .clone()
            .unwrap_or_else(|| "for getting the common-snap between main and main".into());
        self.prepare_versions_with_reason(targets, Some(&reason))
    }
    pub(crate) fn prepare_lane_pattern_versions(&mut self, targets: &[Target]) -> io::Result<()> {
        self.prepare_versions_with_reason(targets, Some("import all history of given patterns components to check whether they have dependencies on the lane"))
    }
    fn prepare_versions_with_reason(
        &mut self,
        targets: &[Target],
        reason: Option<&str>,
    ) -> io::Result<()> {
        if targets.len() > 4096 {
            return Err(invalid("import selected target limit"));
        }
        self.progress.push(super::super::Progress {
            reason: reason.map(str::to_owned),
            ..Default::default()
        });
        for target in targets {
            if target.scope.is_none() {
                continue;
            }
            let remote_scope = self.cache.lane_sources
                .get(&identity(target)?)
                .cloned()
                .or_else(|| target.scope.clone());
            if remote_scope.as_deref() == Some(self.environment.local_scope.as_str()) {
                continue;
            }
            if let Some(path) = self.environment.missing_global_remotes.take() {
                self.environment.global_remotes = Some(path);
            }
            if self.cached_selected(target)? {
                continue;
            }
            let remotes = self.environment.remotes.clone();
            let directory = remote(
                self,
                &remotes,
                remote_scope.as_deref().ok_or_else(|| invalid("import selected scope"))?,
            )?;
            let row =
                self.progress.last_mut().ok_or_else(|| invalid("import selected progress"))?;
            row.ids.push(format!("{}@{}", identity(target)?, target.version));
            row.objects.insert(object_hash(remote_scope.as_deref().unwrap_or_default()));
            let incoming = read_model(self, &directory, target)?
                .ok_or_else(|| invalid("import selected component missing"))?;
            let hash = version_ref(&incoming, &target.version)?;
            super::transfer::receive_cached(self, &directory, target, &incoming, &hash)?;
        }
        self.validate()
    }
    fn cached_selected(&mut self, target: &Target) -> io::Result<bool> {
        let local = self.environment.local_directory.clone();
        let model = read_model(self, &local, target)?;
        let hash = model
            .as_ref()
            .and_then(|model| version_ref(model, &target.version).ok());
        let version = hash
            .as_ref()
            .map(|hash| read_version(self, hash))
            .transpose()?
            .flatten();
        let first_unbuilt = version
            .as_ref()
            .is_some_and(|version| {
                !matches!(version["buildStatus"].as_str(), Some("succeed" | "skipped"))
            })
            && !hash
                .as_ref()
                .is_some_and(|hash| {
                    self.cache.staged
                        .lines()
                        .any(|line| line == hash)
                })
            && self.cache.unbuilt.insert(format!("{}@{}", identity(target)?, target.version));
        if version.is_some() && !first_unbuilt {
            return Ok(true);
        }
        Ok(false)
    }
}
