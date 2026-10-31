//! Cached graph imports never refetch an already available unbuilt seeder.
use super::{PreparedImport, Target, VirtualRemote, read_model, read_version, version_ref};
use std::{io, path::Path};

impl PreparedImport {
    pub(super) fn prime_versionless_graph_ids(&mut self, targets: &[&Target]) -> io::Result<()> {
        for target in targets {
            if target.version.trim() == "latest" {
                self.cache.unbuilt.insert(format!("{}@latest", super::identity(target)?));
            }
        }
        Ok(())
    }
    pub(crate) fn missing_graph_versions(&mut self, targets: &[Target]) -> io::Result<Vec<Target>> {
        if targets.len() > 4096 {
            return Err(super::invalid("import graph target limit"));
        }
        let directory = self.environment.local_directory.clone();
        let mut missing = Vec::new();
        for target in targets {
            let hash = read_model(self, &directory, target)?
                .and_then(|model| version_ref(&model, &target.version).ok());
            let version = hash
                .as_ref()
                .map(|hash| read_version(self, hash))
                .transpose()?
                .flatten();
            if version.is_none() {
                missing.push(target.clone());
            }
        }
        Ok(missing)
    }
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
        for target in targets {
            self.cache.unbuilt.insert(format!("{}@{}", super::identity(target)?, target.version));
        }
        let remotes = self.environment.remotes.clone();
        let scoped = targets
            .iter()
            .filter(|target| target.scope.is_some())
            .collect::<Vec<_>>();
        super::prepare_dependencies(self, root, &scoped, &remotes)?;
        let mut graph_rows = self.progress.split_off(first);
        graph_rows.retain(|row| !row.ids.is_empty() || !row.objects.is_empty());
        self.progress.extend(graph_rows);
        self.validate()
    }
}
