//! Prepare built-in service components and retain loader effects until the command owns execution.
pub(in crate::commands) mod filesystem;
pub(in crate::commands) use load::Loaded;
mod docs;
mod load;
mod selection;
use serde_json::{Value, json};
use std::io;

#[derive(Default)]
pub(in crate::commands) struct Selection {
    pub pattern: Option<String>,
    pub changed: bool,
    pub allow_cached_pair: bool,
    pub single_file_write: bool,
    pub exact: Option<Vec<String>>,
    pub allow_cached_many: bool,
    pub compiler: bool,
    pub explicit_file_order: bool,
}

pub(in crate::commands) struct Progress {
    pub environment: String,
    pub name: String,
    pub identities: Vec<String>,
    pub loads: Vec<usize>,
}

pub(in crate::commands) struct Component {
    pub id: Value,
    pub directory: String,
    pub files: Vec<Value>,
}

fn invalid(message: &str) -> io::Error {
    io::Error::other(message)
}

impl Progress {
    fn new(name: String, environment: String, counts: [usize; 2], options: &Selection) -> Self {
        Self { name, environment, identities: Vec::new(), loads: initial_loads(counts, options) }
    }
}

fn initial_loads(counts: [usize; 2], options: &Selection) -> Vec<usize> {
    let has_pattern = options.pattern
        .as_deref()
        .is_some_and(|pat| !pat.trim().is_empty())
        || options.exact
            .as_ref()
            .is_some_and(|list| !list.is_empty());
    if options.changed && !has_pattern { counts.to_vec() } else { vec![counts[1]] }
}
