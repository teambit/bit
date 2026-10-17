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
        false,
        all_history,
        fetch_dependencies,
    )
}

impl PreparedImport {
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
