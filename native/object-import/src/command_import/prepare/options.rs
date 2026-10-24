//! Retained public import traversal settings.
use super::{PreparedImport, Target, VirtualRemote};
use std::{io, path::Path};

pub(crate) fn prepare_inbound_with_virtual(
    root: &Path,
    global_remotes_file: &Path,
    targets: &[Target],
    virtual_remotes: &[VirtualRemote],
    all_history: bool,
    fetch_dependencies: bool,
) -> io::Result<PreparedImport> {
    super::prepare_with_virtual_options(
        root,
        global_remotes_file,
        targets,
        virtual_remotes,
        super::Mode { all_history, fetch_dependencies, ..super::Mode::default() },
    )
}

pub(crate) fn prepare_graph_inbound_with_virtual(
    root: &Path,
    global_remotes_file: &Path,
    targets: &[Target],
    virtual_remotes: &[VirtualRemote],
    all_history: bool,
    fetch_dependencies: bool,
) -> io::Result<PreparedImport> {
    super::prepare_with_virtual_options(
        root,
        global_remotes_file,
        targets,
        virtual_remotes,
        super::Mode {
            all_history,
            fetch_dependencies,
            graph_versions: !fetch_dependencies,
            ..super::Mode::default()
        },
    )
}

impl PreparedImport {
    /// `importMany({ lane, preferDependencyGraph: false })` traverses all
    /// selected lane and main IDs after their heads have been retained.
    pub(crate) fn prepare_lane_dependencies(
        &mut self,
        root: &Path,
        targets: &[Target],
    ) -> io::Result<()> {
        if targets.is_empty() {
            return Ok(());
        }
        self.cache.fetch_all_dependencies = true;
        for target in targets {
            self.cache.unbuilt.insert(format!("{}@{}", super::identity(target)?, target.version));
        }
        let remotes = self.environment.remotes.clone();
        super::prepare_dependencies(self, root, &targets.iter().collect::<Vec<_>>(), &remotes)?;
        self.validate()
    }

    pub(crate) fn prepare_main_fetch(
        &mut self,
        root: &Path,
        targets: &[Target],
        all_history: bool,
    ) -> io::Result<()> {
        let scoped = targets
            .iter()
            .filter(|target| target.scope.is_some())
            .collect::<Vec<_>>();
        if scoped.is_empty() {
            return Ok(());
        }
        let remotes = self.environment.remotes.clone();
        let available = super::refresh_all(self, &scoped, &remotes, true, all_history)?;
        super::prepare_dependencies(self, root, &available, &remotes)?;
        self.validate()
    }
}

pub(crate) fn prepare_recovery_with_virtual(
    root: &Path,
    global_remotes_file: &Path,
    targets: &[Target],
    fetch: impl FnOnce(&[Target]) -> io::Result<Vec<VirtualRemote>>,
) -> io::Result<PreparedImport> {
    let mut plan = super::prepare_lane(root, global_remotes_file)?;
    let scoped = targets.iter().collect::<Vec<_>>();
    let (local, remote) = super::recovery::retain(&mut plan, &scoped)?;
    let mut available = local.clone();
    let requested = remote
        .iter()
        .map(|target| (*target).clone())
        .collect::<Vec<_>>();
    for incoming in fetch(&requested)? {
        plan.virtual_remote(&incoming.scope, incoming.path, &incoming.objects)?;
    }
    plan.bitmap_count = targets.len();
    let remotes = plan.environment.remotes.clone();
    available.extend(super::refresh_all(&mut plan, &remote, &remotes, false, false)?);
    super::recovery::record_local_main(&mut plan, &local, &remotes)?;
    super::prepare_dependencies(&mut plan, root, &available, &remotes)?;
    super::recovery::retain_cached_versions(&mut plan, targets)?;
    super::recovery::retain_histories(&mut plan, &local)?;
    plan.validate()?;
    Ok(plan)
}
