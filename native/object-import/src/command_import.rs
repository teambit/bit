//! A retained, read-only checkout refresh plan. The command owner decides when
//! an eligible command may publish it; planning never writes to either scope.
pub(crate) mod lane;
#[cfg(test)]
pub(crate) mod tests;
pub(crate) use prepare::{
    VirtualRemote,
    options::{
        prepare_graph_inbound_with_virtual, prepare_inbound_with_virtual,
        prepare_recovery_with_virtual,
    },
    prepare, prepare_cached, prepare_lane, prepare_lane_with_virtual, prepare_status_with_virtual,
};
pub(crate) use remote_error::message as remote_inflate_message;
pub(crate) use retained::write_receipt;
mod capture;
mod history;
mod merge;
mod prepare;
mod publish;
mod remote_error;
mod retained;

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
    lane_refs: HashMap<(String, String), Value>,
}
impl Overlay {
    pub(crate) fn object_references(&self) -> impl Iterator<Item = &str> {
        self.objects.keys().map(String::as_str)
    }
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
    pub(crate) fn trace_source(&self, hash: &str) -> io::Result<()> {
        let record = self.objects.get(hash).ok_or_else(|| invalid("import Source receipt"))?;
        let body = record.source.as_deref().ok_or_else(|| invalid("import Source body"))?;
        crate::merge_transaction::reads::source_parts(
            crate::merge_history::hash(hash)?,
            body,
            record.bytes.len(),
            record.inflated_size,
        )
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
    pub(crate) fn lane_refs(&self, scope: &str, name: &str) -> Option<&[Value]> {
        self.lane_refs
            .get(&(scope.to_owned(), name.to_owned()))
            .and_then(Value::as_array)
            .map(Vec::as_slice)
    }
    pub(crate) fn compressed(&self, hash: &str) -> Option<&[u8]> {
        self.objects.get(hash).map(|record| record.bytes.as_slice())
    }
}
#[derive(Default)]
pub(crate) struct Progress {
    pub(crate) requested: Option<usize>,
    pub(crate) object_request: bool,
    pub(crate) reason: Option<String>,
    pub(crate) ids: Vec<String>,
    pub(crate) components: std::collections::HashSet<String>,
    pub(crate) objects: std::collections::HashSet<String>,
}
pub(crate) struct PreparedImport {
    pub(crate) overlay: Overlay,
    pub(crate) progress: Vec<Progress>,
    pub(crate) bitmap_count: usize,
    pub(crate) main_refresh: MainRefresh,
    capture: Capture,
    environment: Environment,
    cache: Cache,
    writes: Writes,
}
#[derive(Default)]
pub(crate) struct MainRefresh {
    pub(crate) count: usize,
    pub(crate) objects: usize,
}
impl MainRefresh {
    fn observe(&mut self, model: &Value) {
        self.count += 1;
        self.objects += usize::from(model["head"].is_null());
    }
}
impl PreparedImport {
    pub(crate) fn all_external_targets_unmapped(
        &self,
        targets: &[Target],
        default_scope: &str,
    ) -> bool {
        let mut external = targets
            .iter()
            .map(|target| target.scope.as_deref().unwrap_or(default_scope))
            .filter(|scope| *scope != self.environment.local_scope.as_str());
        external
            .next()
            .is_some_and(|first| {
                self.environment.remotes.get(first).is_none()
                    && external.all(|scope| self.environment.remotes.get(scope).is_none())
            })
    }

    pub(crate) fn recovery_staged(&mut self, bytes: Option<&[u8]>) -> io::Result<()> {
        self.cache.staged =
            String::from_utf8(bytes.unwrap_or_default().to_vec()).map_err(io::Error::other)?;
        Ok(())
    }
    pub(crate) fn accept_recovery_staged(
        &mut self,
        root: &std::path::Path,
        bytes: Option<&[u8]>,
    ) -> io::Result<()> {
        self.capture.accept_restored(&crate::scope_path(root).join("staged-snaps"), bytes)
    }
    pub(crate) fn planned_index(&self) -> &Value {
        &self.writes.index
    }
}

struct Environment {
    local_directory: PathBuf,
    remote_overrides: HashMap<String, PathBuf>,
    global_remotes: Option<PathBuf>,
    missing_global_remotes: Option<PathBuf>,
    remotes: Value,
    local_scope: String,
}
#[derive(Default)]
struct Cache {
    staged: String,
    only_if_built: bool,
    fetch_all_dependencies: bool,
    unbuilt: std::collections::HashSet<String>,
    lane_sources: HashMap<String, String>,
    lane_reason: Option<String>,
    fetched_lane: Option<lane::Record>,
    switch_existing_versions: bool,
}
struct Writes {
    remote_objects: Vec<(PathBuf, String, Value)>,
    index: Value,
    index_changed: bool,
    lane_histories: Vec<Value>,
    switch_tracking: Option<Vec<u8>>,
}
impl PreparedImport {
    pub(crate) fn virtual_remote(
        &mut self,
        scope: &str,
        path: PathBuf,
        objects: &[(String, Vec<u8>)],
    ) -> io::Result<()> {
        if scope.is_empty() || objects.len() > 16384 {
            return Err(invalid("virtual import remote bounds"));
        }
        if path.try_exists()? || self.environment.remote_overrides.contains_key(scope) {
            return Err(invalid("virtual import remote collision"));
        }
        self.capture.virtual_file(
            path.join("scope.json"),
            serde_json::to_vec(&serde_json::json!({"name":scope})).map_err(io::Error::other)?,
        )?;
        let mut inflated_total = 0usize;
        for (hash, compressed) in objects {
            inflated_total += validate_virtual_object(hash, compressed)?;
            if inflated_total > capture::MAX_BYTES {
                return Err(invalid("virtual import inflated byte limit"));
            }
            self.capture.virtual_file(
                path.join("objects")
                    .join(&hash[..2])
                    .join(&hash[2..]),
                compressed.clone(),
            )?;
        }
        self.environment.remote_overrides.insert(scope.to_owned(), path);
        Ok(())
    }
    pub(crate) fn validate(&self) -> io::Result<()> {
        if self.writes.index_changed {
            crate::store::Store::new(self.environment.local_directory.clone(), None)?
                .validate_index_write()?;
        }
        self.capture.validate()
    }
}
fn validate_virtual_object(hash: &str, compressed: &[u8]) -> io::Result<usize> {
    crate::merge_history::hash(hash)?;
    let raw = crate::checkout::repository::inflate(compressed, 32 * 1024 * 1024)?;
    let kind = raw
        .split(|byte| *byte == b' ')
        .next()
        .and_then(|kind| std::str::from_utf8(kind).ok())
        .ok_or_else(|| invalid("virtual import object header"))?;
    if !matches!(
        kind,
        "Source"
            | "ScopeMeta"
            | "Version"
            | "VersionHistory"
            | "Component"
            | "Lane"
            | "LaneHistory",
    ) {
        return Err(invalid("virtual import object kind"));
    }
    let (_, body) =
        crate::checkout::repository::split(&raw, crate::merge_history::hash(hash)?, kind)?;
    if kind == "Source" {
        use sha1::{Digest, Sha1};
        if crate::validate::hexadecimal(&Sha1::digest(body)) != *hash {
            return Err(invalid("virtual import Source identity"));
        }
    } else {
        let _: Value = serde_json::from_slice(body).map_err(io::Error::other)?;
    }
    Ok(raw.len())
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn object_hash(identity: &str) -> String {
    use sha1::{Digest, Sha1};
    crate::validate::hexadecimal(&Sha1::digest(identity.as_bytes()))
}
