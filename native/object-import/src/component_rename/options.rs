//! The published component-rename flags, independent of CLI parsing.
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
    #[must_use]
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
                .map(str::trim)
                .filter(|val| !val.is_empty())
                .map(str::to_owned),
            ..*self
        }
    }
}
