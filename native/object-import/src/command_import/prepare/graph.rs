//! Cached graph imports never refetch an already available unbuilt seeder.
//!
//! Identifies missing graph versions on [`PreparedImport`] and prepares dependency-graph imports from [`VirtualRemote`]s.
use super::{PreparedImport, Target, VirtualRemote, read_model, read_version, version_ref};
use std::{io, path::Path};

impl PreparedImport {
    /// Record versionless (`""`, `"latest"`, `"head"`) graph target IDs in the unbuilt seeder set.
    #[inline]
    pub(super) fn prime_versionless_graph_ids(&mut self, targets: &[&Target]) -> io::Result<()> {
        for target in targets {
            let version = target.version.trim();
            if version.is_empty() || matches!(version, "latest" | "head") {
                let suffix = if version.is_empty() { "latest" } else { version };
                self.cache.unbuilt.insert(format!("{}@{suffix}", super::identity(target)?));
            }
        }
        Ok(())
    }
    /// Filter `targets` to those whose `Component` model or target `Version` object is missing locally.
    #[inline]
    pub(crate) fn missing_graph_versions(&mut self, targets: &[Target]) -> io::Result<Vec<Target>> {
        if targets.is_empty() {
            return Ok(Vec::new());
        }
        if targets.len() > 4096 {
            return Err(super::invalid("import graph target limit"));
        }
        let directory = self.environment.local_directory.clone();
        let mut missing = Vec::new();
        for target in targets {
            let present = read_model(self, &directory, target)?
                .and_then(|model| version_ref(&model, &target.version).ok())
                .map(|hash| read_version(self, &hash))
                .transpose()?
                .flatten()
                .is_some();
            if !present {
                missing.push(target.clone());
            }
        }
        Ok(missing)
    }
    /// Stage graph [`Target`] versions and their transitive dependencies from [`VirtualRemote`]s and `root`.
    pub(crate) fn prepare_graph_versions(
        &mut self,
        root: &Path,
        targets: &[Target],
        virtual_remotes: &[VirtualRemote],
    ) -> io::Result<()> {
        for remote in virtual_remotes {
            self.virtual_remote(&remote.scope, remote.path.clone(), &remote.objects)?;
        }
        let first = self.progress.len();
        let previous = self.cache.switch_existing_versions;
        self.cache.switch_existing_versions = true;
        let result = self.prepare_versions_with_reason(
            targets,
            Some("for building graph-ids from the workspace"),
        );
        self.cache.switch_existing_versions = previous;
        result?;
        let scoped = targets
            .iter()
            .filter(|target| {
                target.scope
                    .as_deref()
                    .is_some_and(|scope| !scope.trim().is_empty())
            })
            .collect::<Vec<_>>();
        self.cache.unbuilt.reserve(scoped.len());
        for target in &scoped {
            self.cache.unbuilt.insert(format!(
                "{}@{}",
                super::identity(target)?,
                target.version.trim(),
            ));
        }
        let remotes = self.environment.remotes.clone();
        super::prepare_dependencies(self, root, &scoped, &remotes)?;
        let mut graph_rows = self.progress.split_off(first);
        graph_rows.retain(|row| !row.ids.is_empty() || !row.objects.is_empty());
        self.progress.extend(graph_rows);
        self.validate()
    }
}
