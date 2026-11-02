//! Published component-rename [`Options`] and flag normalization, independent of CLI parsing.
//!
//! Normalizes source/target identifiers, optional scope, and relative paths via [`Options::normalized`] before rename planning.
/// Validated CLI options for `bit rename` component identity, path, and refactoring operations.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Options {
    pub source: String,
    pub target: String,
    pub scope: Option<String>,
    pub path: Option<String>,
    pub refactor: bool,
    pub preserve: bool,
    pub ast: bool,
    pub deprecate: bool,
}
impl Options {
    /// Return a copy of [`Options`] with trimmed identifiers and a normalized forward-slash relative `path`.
    #[must_use]
    #[inline]
    pub(super) fn normalized(&self) -> Self {
        Self {
            source: self.source.trim().to_owned(),
            target: self.target.trim().to_owned(),
            scope: self.scope
                .as_deref()
                .map(str::trim)
                .filter(|val| !val.is_empty())
                .map(str::to_owned),
            path: self.path
                .as_deref()
                .map(|val| {
                    let trimmed = val.trim();
                    let normalized = if trimmed.contains('\\') {
                        std::borrow::Cow::Owned(trimmed.replace('\\', "/"))
                    } else {
                        std::borrow::Cow::Borrowed(trimmed)
                    };
                    let mut stripped = normalized.as_ref();
                    while let Some(rest) = stripped.strip_prefix("./") {
                        stripped = rest;
                    }
                    stripped.trim_matches('/').to_owned()
                })
                .filter(|val| !val.is_empty()),
            ..*self
        }
    }
}
