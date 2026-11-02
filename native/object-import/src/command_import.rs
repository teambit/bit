//! A retained, read-only checkout refresh plan. The command owner decides when
//! an eligible command may publish it; planning never writes to either scope.
//!
//! Coordinates [`Object`] [`Capture`], version-history population, [`lane`] merging, and atomic publication.
pub(crate) mod lane;
#[cfg(test)]
pub(crate) mod tests;
pub(crate) use prepare::{
    VirtualRemote,
    options::{
        prepare_graph_inbound_with_virtual, prepare_inbound_with_virtual,
        prepare_recovery_with_virtual,
    },
    prepare, prepare_cached, prepare_lane, prepare_lane_at, prepare_lane_with_virtual,
    prepare_status_with_virtual,
};
pub(crate) use remote_error::message as remote_inflate_message;
pub(crate) use retained::write_receipt;
mod capture;
mod history;
mod merge;
mod prepare;
mod publish;
mod recovery_objects;
mod remote_error;
mod retained;

use capture::{Capture, Object};
use serde_json::Value;
use std::{collections::HashMap, io, path::PathBuf};

/// Component import target specifying optional scope, default scope, name, and requested version.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Target {
    /// Bitmap scope, before defaultScope is substituted for unexported IDs.
    pub(crate) scope: Option<String>,
    /// Component name within its scope.
    pub(crate) name: String,
    /// Requested version tag, snap hash, `"latest"`, or `"head"`.
    pub(crate) version: String,
}
/// In-memory overlay of staged scope [`Object`]s, remote refs, and lane refs for a prepared import.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(crate) struct Overlay {
    objects: HashMap<String, Object>,
    pub(crate) remote_refs: HashMap<String, Value>,
    lane_refs: HashMap<(String, String), Value>,
}
impl Overlay {
    /// Iterate over all staged object SHA-1 hex keys in this overlay.
    #[inline]
    pub(crate) fn object_references(&self) -> impl Iterator<Item = &str> {
        self.objects.keys().map(String::as_str)
    }
    /// Read a staged metadata [`Object`] of type `kind` by `hash` as a [`Value`] from this overlay.
    #[inline]
    pub(crate) fn read(&self, hash: &str, kind: &str) -> io::Result<Option<&Value>> {
        let kind = kind.trim();
        self.objects
            .get(hash.trim())
            .map(|record| {
                if record.kind != kind {
                    return Err(invalid("import overlay object type"));
                }
                record.value.as_ref().ok_or_else(|| invalid("import overlay Source metadata"))
            })
            .transpose()
    }
    /// Borrow the raw `Source` file payload for `hash` when staged in this overlay.
    #[inline]
    pub(crate) fn source(&self, hash: &str) -> Option<&[u8]> {
        self.objects.get(hash.trim()).and_then(|record| record.source.as_deref())
    }
    #[inline]
    pub(crate) fn trace_source(&self, hash: &str) -> io::Result<()> {
        let hash = hash.trim();
        let record = self.objects.get(hash).ok_or_else(|| invalid("import Source receipt"))?;
        let body = record.source.as_deref().ok_or_else(|| invalid("import Source body"))?;
        crate::merge_transaction::reads::source_parts(
            crate::merge_history::hash(hash)?,
            body,
            record.bytes.len(),
            record.inflated_size,
        )
    }
    #[inline]
    pub(crate) fn models(&self) -> Vec<&Value> {
        self.objects
            .values()
            .filter(|record| record.kind == "Component")
            .filter_map(|record| record.value.as_ref())
            .collect()
    }
    #[inline]
    pub(crate) fn refs(&self, scope: &str) -> Option<&[Value]> {
        self.remote_refs
            .get(scope.trim())
            .and_then(Value::as_array)
            .map(Vec::as_slice)
    }
    #[inline]
    pub(crate) fn lane_refs(&self, scope: &str, name: &str) -> Option<&[Value]> {
        self.lane_refs
            .get(&(scope.trim().to_owned(), name.trim().to_owned()))
            .and_then(Value::as_array)
            .map(Vec::as_slice)
    }
    #[inline]
    pub(crate) fn compressed(&self, hash: &str) -> Option<&[u8]> {
        self.objects.get(hash.trim()).map(|record| record.bytes.as_slice())
    }
}
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(crate) struct Progress {
    pub(crate) requested: Option<usize>,
    pub(crate) object_request: bool,
    pub(crate) reason: Option<String>,
    pub(crate) ids: Vec<String>,
    pub(crate) components: std::collections::HashSet<String>,
    pub(crate) objects: std::collections::HashSet<String>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
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
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct MainRefresh {
    pub(crate) count: usize,
    pub(crate) objects: usize,
}
impl MainRefresh {
    #[inline]
    fn observe(&mut self, model: &Value) {
        self.count += 1;
        self.objects += usize::from(model["head"].is_null());
    }
}
impl PreparedImport {
    pub(crate) fn remote_host(&mut self, scope: &str, host: &str) -> io::Result<()> {
        let scope = scope.trim();
        let host = host.trim();
        if scope.is_empty() {
            return Err(invalid("import remote scope"));
        }
        bit_client_transfer::remotes::Remote::from_host(host)?;
        let remotes = self.environment.remotes
            .as_object_mut()
            .ok_or_else(|| invalid("import remotes map"))?;
        remotes.insert(scope.to_owned(), Value::String(host.to_owned()));
        Ok(())
    }

    pub(crate) fn all_external_targets_unmapped(
        &self,
        targets: &[Target],
        default_scope: &str,
    ) -> bool {
        let default_scope = default_scope.trim();
        let local_scope = self.environment.local_scope.trim();
        let is_unmapped = |scope: &str| {
            !self.environment.remote_overrides.contains_key(scope)
                && self.environment.remotes.get(scope).is_none()
        };
        let mut external = targets
            .iter()
            .filter_map(|target| {
                target.scope
                    .as_deref()
                    .map(str::trim)
                    .filter(|scope| !scope.is_empty())
                    .or_else(|| (!default_scope.is_empty()).then_some(default_scope))
            })
            .filter(|scope| *scope != local_scope);
        external
            .next()
            .is_some_and(|first| is_unmapped(first) && external.all(is_unmapped))
    }

    #[inline]
    pub(crate) fn recovery_staged(&mut self, bytes: Option<&[u8]>) -> io::Result<()> {
        std::str::from_utf8(bytes.unwrap_or_default())
            .map_err(io::Error::other)?
            .clone_into(&mut self.cache.staged);
        Ok(())
    }
    #[inline]
    pub(crate) fn accept_recovery_staged(
        &mut self,
        root: &std::path::Path,
        bytes: Option<&[u8]>,
    ) -> io::Result<()> {
        self.capture.accept_restored(&crate::scope_path(root).join("staged-snaps"), bytes)
    }
    #[inline]
    pub(crate) fn planned_index(&self) -> &Value {
        &self.writes.index
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Environment {
    local_directory: PathBuf,
    remote_overrides: HashMap<String, PathBuf>,
    global_remotes: Option<PathBuf>,
    missing_global_remotes: Option<PathBuf>,
    remotes: Value,
    local_scope: String,
}
#[derive(Debug, Default, Clone, PartialEq, Eq)]
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
#[derive(Debug, Clone, PartialEq, Eq)]
struct Writes {
    remote_objects: Vec<(PathBuf, String, Value)>,
    index: Value,
    index_changed: bool,
    lane_histories: Vec<Value>,
    switch_tracking: Option<Vec<u8>>,
    post_write_bitmap_history: bool,
    switch_warning: Option<String>,
}
impl PreparedImport {
    #[inline]
    pub(crate) fn switch_warning(&self) -> Option<&str> {
        self.writes.switch_warning.as_deref()
    }

    #[inline]
    pub(crate) fn mark_post_write_bitmap_history(&mut self) {
        self.writes.post_write_bitmap_history = true;
    }

    #[inline]
    pub(crate) fn post_write_bitmap_history(&self) -> bool {
        self.writes.post_write_bitmap_history
    }

    pub(crate) fn virtual_remote(
        &mut self,
        scope: &str,
        path: PathBuf,
        objects: &[(String, Vec<u8>)],
    ) -> io::Result<()> {
        let scope = scope.trim();
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
        let objects_dir = path.join("objects");
        let mut inflated_total = 0usize;
        for (hash, compressed) in objects {
            let hash = hash.trim();
            inflated_total =
                inflated_total.saturating_add(validate_virtual_object(hash, compressed)?);
            if inflated_total > capture::MAX_BYTES {
                return Err(invalid("virtual import inflated byte limit"));
            }
            self.capture.virtual_file(
                objects_dir
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
    let hash = hash.trim();
    let identity = crate::merge_history::hash(hash)?;
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
    let (_, body) = crate::checkout::repository::split(&raw, identity, kind)?;
    if kind == "Source" {
        use sha1::{Digest, Sha1};
        if crate::validate::hexadecimal(&Sha1::digest(body)) != hash {
            return Err(invalid("virtual import Source identity"));
        }
    } else {
        let _: Value = crate::parse_jsonc(body)?;
    }
    Ok(raw.len())
}
#[inline]
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
#[inline]
fn object_hash(identity: &str) -> String {
    use sha1::{Digest, Sha1};
    crate::validate::hexadecimal(&Sha1::digest(identity.as_bytes()))
}
