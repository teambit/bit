//! The published component-rename flags, independent of CLI parsing.
#[derive(Default, Clone)]
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
