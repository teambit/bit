//! `RenamingMain` end-of-line policy ([`Writer`]): `ComponentWriter` normalization only for unversioned, non-preserved targets.

#[cfg(test)]
mod tests;

/// End-of-line normalization policy distinguishing `ComponentWriter` from `Workspace.write()`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Writer {
    Component,
    Workspace,
}
impl Writer {
    #[must_use]
    #[inline]
    pub(super) const fn target(exported: bool, preserve: bool) -> Self {
        if exported || preserve { Self::Workspace } else { Self::Component }
    }
    #[must_use]
    #[inline]
    pub(super) fn contents(self, bytes: Vec<u8>, windows: bool) -> Vec<u8> {
        match self {
            // ComponentWriter persists AbstractVinyl through eol.auto().
            Self::Component
                if (windows || bytes.contains(&b'\r')) && !crate::checkout::eol::binary(&bytes) =>
            {
                crate::checkout::eol::normalize(bytes, windows)
            }
            // NewComponentHelper and changed dependents call Workspace.write(),
            // which passes SourceFile.contents directly to fs-extra.outputFile.
            Self::Component | Self::Workspace => bytes,
        }
    }
}
