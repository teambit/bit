//! `RenamingMain` uses `ComponentWriter` only for an unversioned, non-preserved target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Writer {
    Component,
    Workspace,
}
impl Writer {
    #[must_use]
    pub(super) const fn target(exported: bool, preserve: bool) -> Self {
        if exported || preserve { Self::Workspace } else { Self::Component }
    }
    #[must_use]
    pub(super) fn contents(self, bytes: Vec<u8>, windows: bool) -> Vec<u8> {
        match self {
            // ComponentWriter persists AbstractVinyl through eol.auto().
            Self::Component => crate::checkout::eol::normalize(bytes, windows),
            // NewComponentHelper and changed dependents call Workspace.write(),
            // which passes SourceFile.contents directly to fs-extra.outputFile.
            Self::Workspace => bytes,
        }
    }
}

#[cfg(test)]
mod tests;
