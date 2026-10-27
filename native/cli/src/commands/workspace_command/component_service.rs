//! Prepare built-in service components and retain loader effects until the command owns execution.
pub(in crate::commands) mod filesystem;
pub(in crate::commands) use load::Loaded;
mod docs;
mod load;
use serde_json::{Value, json};
use std::io;

pub(in crate::commands) struct Selection {
    pub pattern: Option<String>,
    pub changed: bool,
    pub allow_cached_pair: bool,
    pub single_file_write: bool,
}

pub(in crate::commands) struct Progress {
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
