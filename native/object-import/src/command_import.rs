//! A retained, read-only checkout refresh plan. The command owner decides when
//! an eligible command may publish it; planning never writes to either scope.
#[cfg(test)]
pub(crate) mod tests;
pub(crate) use prepare::{prepare, prepare_cached};
mod capture;
mod history;
mod merge;
mod prepare;
mod publish;

use capture::{Capture, Object};
use serde_json::Value;
use std::{collections::HashMap, io, path::PathBuf};

#[derive(Clone)]
pub(crate) struct Target {
    /// Bitmap scope, before defaultScope is substituted for unexported IDs.
    pub(crate) scope: Option<String>,
    pub(crate) name: String,
    pub(crate) version: String,
}
#[derive(Default)]
pub(crate) struct Overlay {
    objects: HashMap<String, Object>,
    pub(crate) remote_refs: HashMap<String, Value>,
}
impl Overlay {
    pub(crate) fn read(&self, hash: &str, kind: &str) -> io::Result<Option<&Value>> {
        self.objects
            .get(hash)
            .map(|record| {
                if record.kind != kind {
                    return Err(invalid("import overlay object type"));
                }
                record.value.as_ref().ok_or_else(|| invalid("import overlay Source metadata"))
            })
            .transpose()
    }
    pub(crate) fn source(&self, hash: &str) -> Option<&[u8]> {
        self.objects.get(hash).and_then(|record| record.source.as_deref())
    }
    pub(crate) fn models(&self) -> Vec<&Value> {
        self.objects
            .values()
            .filter_map(|record| {
                (record.kind == "Component").then_some(())?;
                record.value.as_ref()
            })
            .collect()
    }
    pub(crate) fn refs(&self, scope: &str) -> Option<&[Value]> {
        self.remote_refs
            .get(scope)
            .and_then(Value::as_array)
            .map(Vec::as_slice)
    }
    pub(crate) fn compressed(&self, hash: &str) -> Option<&[u8]> {
        self.objects.get(hash).map(|record| record.bytes.as_slice())
    }
}
#[derive(Default)]
pub(crate) struct Progress {
    pub(crate) reason: Option<String>,
    pub(crate) ids: Vec<String>,
    pub(crate) components: std::collections::HashSet<String>,
    pub(crate) objects: std::collections::HashSet<String>,
}
pub(crate) struct PreparedImport {
    pub(crate) overlay: Overlay,
    pub(crate) progress: Vec<Progress>,
    pub(crate) bitmap_count: usize,
    capture: Capture,
    environment: Environment,
    cache: Cache,
    writes: Writes,
}
struct Environment {
    local_directory: PathBuf,
    global_remotes: Option<PathBuf>,
    missing_global_remotes: Option<PathBuf>,
    remotes: Value,
    local_scope: String,
}
#[derive(Default)]
struct Cache {
    staged: String,
    only_if_built: bool,
    unbuilt: std::collections::HashSet<String>,
}
struct Writes {
    remote_objects: Vec<(PathBuf, String, Value)>,
    index: Value,
    index_changed: bool,
}
impl PreparedImport {
    pub(crate) fn validate(&self) -> io::Result<()> {
        self.capture.validate()
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn object_hash(identity: &str) -> String {
    use sha1::{Digest, Sha1};
    crate::validate::hexadecimal(&Sha1::digest(identity.as_bytes()))
}
