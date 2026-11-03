//! Retained public import traversal settings.
//!
//! Entrypoints for inbound ([`prepare_inbound_with_virtual`]), graph-inbound, recovery, and status import preparation with [`VirtualRemote`]s.
use super::{PreparedImport, Target, VirtualRemote};
use std::{io, path::Path};

/// Prepare an inbound [`PreparedImport`] plan with optional [`VirtualRemote`]s, `all_history`, and `fetch_dependencies`.
#[inline]
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

/// Prepare an inbound [`PreparedImport`] plan for [`Target`]s with [`VirtualRemote`]s that enables `graph_versions` when `fetch_dependencies` is `false`.
#[inline]
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
        if targets.len() > 4096 {
            return Err(super::invalid("import lane dependency target limit"));
        }
        let scoped = scoped_targets(targets);
        if scoped.is_empty() {
            return Ok(());
        }
        self.cache.fetch_all_dependencies = true;
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
        self.validate()
    }

    /// Refresh `main` heads and transitive dependencies for [`Target`]s from configured remotes at [`Path`] `root`.
    pub(crate) fn prepare_main_fetch(
        &mut self,
        root: &Path,
        targets: &[Target],
        all_history: bool,
    ) -> io::Result<()> {
        if targets.len() > 4096 {
            return Err(super::invalid("import main fetch target limit"));
        }
        let scoped = scoped_targets(targets);
        if scoped.is_empty() {
            return Ok(());
        }
        let remotes = self.environment.remotes.clone();
        let available = super::refresh_all(self, &scoped, &remotes, true, all_history)?;
        super::prepare_dependencies(self, root, &available, &remotes)?;
        self.validate()
    }
}

#[inline]
fn scoped_targets(targets: &[Target]) -> Vec<&Target> {
    targets
        .iter()
        .filter(|target| {
            target.scope
                .as_deref()
                .is_some_and(|scope| !scope.trim().is_empty())
        })
        .collect()
}

pub(crate) fn prepare_recovery_with_virtual(
    root: &Path,
    global_remotes_file: &Path,
    targets: &[Target],
    fetch: impl FnOnce(&[Target]) -> io::Result<Vec<VirtualRemote>>,
) -> io::Result<PreparedImport> {
    let mut plan = super::prepare_lane(root, global_remotes_file)?;
    let scoped = scoped_targets(targets);
    let (local, remote) = super::recovery::retain(&mut plan, &scoped)?;
    let mut available = Vec::with_capacity(scoped.len());
    available.extend_from_slice(&local);
    let requested = remote
        .iter()
        .map(|target| (*target).clone())
        .collect::<Vec<_>>();
    for incoming in fetch(&requested)? {
        plan.virtual_remote(&incoming.scope, incoming.path, &incoming.objects)?;
    }
    plan.bitmap_count = scoped.len();
    let remotes = plan.environment.remotes.clone();
    available.extend(super::refresh_all(&mut plan, &remote, &remotes, false, false)?);
    super::recovery::record_local_main(&mut plan, &local, &remotes)?;
    super::prepare_dependencies(&mut plan, root, &available, &remotes)?;
    super::recovery::retain_cached_versions(&mut plan, targets)?;
    super::recovery::retain_histories(&mut plan, &local)?;
    plan.validate()?;
    Ok(plan)
}
