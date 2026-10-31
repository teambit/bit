//! Canonical remote-lane seed selection for checkout's initial object import.
use super::{PreparedImport, Target, invalid, remote};
use crate::command_import::lane::{Id, Record, entries};
use std::{collections::HashSet, io, path::Path};
impl PreparedImport {
    /// `importCurrentObjects` seeds both remote lane versions and distinct bitmap versions.
    /// Resolving the remote Lane itself is a metadata read, not a component import row.
    pub(crate) fn prepare_checkout_lane(
        &mut self,
        root: &Path,
        id: &Id,
        bitmap: &[Target],
    ) -> io::Result<()> {
        let remotes = self.environment.remotes.clone();
        let directory = remote(self, &remotes, &id.scope)?;
        let hash = super::lane::remote_lane_hash(self, &directory, id)?;
        let value = self.capture
            .object(&directory, &hash, "Lane")?
            .and_then(|record| record.value)
            .ok_or_else(|| invalid("checkout remote Lane missing"))?;
        super::super::lane::validate_value(id, &value)?;
        let remote_targets = lane_targets(&value)?;
        let targets = seeds(&remote_targets, bitmap);
        self.bitmap_count = targets.len();
        self.progress.push(super::super::Progress {
            reason: Some(format!("of their latest on lane {}/{}", id.scope, id.name)),
            objects: std::iter::once(super::object_hash(&id.scope)).collect(),
            ..Default::default()
        });
        let mut visited = HashSet::new();
        for target in &remote_targets {
            super::lane::receive_closure(self, &directory, &id.scope, target, &mut visited)?;
        }
        self.checkout_off_lane(&targets, &remote_targets, &remotes)?;
        super::prepare_dependencies(self, root, &targets.iter().collect::<Vec<_>>(), &remotes)?;
        self.checkout_lane_refresh(id, &Record { hash, value, is_new: false })?;
        self.validate()
    }
    /// Fetch lane objects for both lane heads and distinct tracked workspace versions.
    pub(crate) fn prepare_fetch_lane(
        &mut self,
        root: &Path,
        id: &Id,
        hash: Option<&str>,
        bitmap: &[Target],
        all_history: bool,
        fetch_dependencies: bool,
    ) -> io::Result<Vec<Target>> {
        let record = self.fetch_lane_contents_at_hash(id, hash)?;
        let remote_targets = lane_targets(&record.value)?;
        for target in &remote_targets {
            self.cache.lane_sources.insert(super::identity(target)?, id.scope.clone());
        }
        let targets = seeds(&remote_targets, bitmap);
        let remotes = self.environment.remotes.clone();
        self.checkout_off_lane(&targets, &remote_targets, &remotes)?;
        if self.load_lane(id)?.is_some() {
            self.publish_imported_lane(id, &record)?;
            if !self.lane_import_histories().is_empty() {
                return Err(super::invalid("fetch lane history merge"));
            }
        } else {
            self.retain_remote_lane_refs(&record)?;
        }
        if let Some(row) = self.progress.last_mut() {
            row.reason = Some(format!("of their latest on lane {}/{}", id.scope, id.name));
        }
        if all_history {
            self.collect_lane_history(id, &remote_targets)?;
        }
        if fetch_dependencies {
            self.prepare_lane_dependencies(root, &targets)?;
        } else {
            super::prepare_dependencies(self, root, &targets.iter().collect::<Vec<_>>(), &remotes)?;
        }
        if let Some(last) = self.progress.last_mut() {
            last.requested = Some(targets.len());
        }
        self.validate()?;
        Ok(targets)
    }
    fn checkout_lane_refresh(&mut self, id: &Id, incoming: &Record) -> io::Result<()> {
        self.publish_imported_lane(id, incoming)?;
        Ok(())
    }

    fn checkout_off_lane(
        &mut self,
        targets: &[Target],
        lane: &[Target],
        remotes: &serde_json::Value,
    ) -> io::Result<()> {
        let outside = targets
            .iter()
            .filter(|target| {
                !lane
                    .iter()
                    .any(|row| row.scope == target.scope && row.name == target.name)
            })
            .collect::<Vec<_>>();
        if outside.is_empty() {
            return Ok(());
        }
        for target in outside {
            let scope = target.scope.as_deref().ok_or_else(|| invalid("checkout scope"))?;
            if scope == self.environment.local_scope {
                continue;
            }
            let directory = remote(self, remotes, scope)?;
            let model = super::read_model(self, &directory, target)?
                .ok_or_else(|| invalid("checkout off-lane model missing"))?;
            let Some(head) = model["head"].as_str() else { continue };
            let row = self.progress.last_mut().ok_or_else(|| invalid("checkout lane refresh"))?;
            row.ids.push(super::identity(target)?);
            row.objects.insert(super::object_hash(scope));
            super::receive(self, &directory, target, &model, head, true)?;
        }
        Ok(())
    }
}

fn lane_targets(value: &serde_json::Value) -> io::Result<Vec<Target>> {
    entries(value)?
        .into_iter()
        .map(|entry| {
            let (scope, name) = entry.identity
                .split_once('/')
                .ok_or_else(|| invalid("checkout lane component identity"))?;
            Ok(Target { scope: Some(scope.into()), name: name.into(), version: entry.head })
        })
        .collect()
}

fn seeds(remote: &[Target], bitmap: &[Target]) -> Vec<Target> {
    let mut targets = remote.to_vec();
    for target in bitmap.iter().filter(|target| target.scope.is_some()) {
        if !targets
            .iter()
            .any(|row| {
                row.scope == target.scope
                    && row.name == target.name
                    && row.version == target.version
            })
        {
            targets.push(target.clone());
        }
    }
    targets
}
