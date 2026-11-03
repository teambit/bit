//! Direct client-side [`Pending`] transfer and canonical remote server [`Actions`] via [`file_bridge`].

mod file_bridge;
mod group;

use super::{Pending, Prepare, Retained, invalid};
use bit_client_transfer::{http::Network, remotes::Remote, tar};
use file_bridge::FileBridge;
use serde_json::{Value, json};
use std::{fs, io, path::Path};

/// Maximum total compressed archive bytes (`32 MiB`) allowed for a single remote outbound [`Pending`] batch.
const MAX_BYTES: usize = 32 * 1024 * 1024;

/// One lazily started file-remote server-action process per outbound Apply.
/// HTTP scopes continue to use the native network client.
pub(super) struct Actions {
    file: Option<FileBridge>,
}

impl Actions {
    /// Creates an empty remote [`Actions`] dispatcher with no active file-bridge child process.
    #[inline]
    pub(super) fn new(_retained: &Retained) -> io::Result<Self> {
        Ok(Self { file: None })
    }

    /// Executes server action `name` with `options` against `pending`'s file or HTTP remote.
    fn action(
        &mut self,
        retained: &Retained,
        pending: &Pending,
        name: &str,
        options: &Value,
    ) -> io::Result<Value> {
        check_client_id(&retained.client_id)?;
        match Remote::from_host(&pending.host)? {
            Remote::File(path) => {
                check_file_remote(&path, &pending.scope)?;
                if let Some(adapter) = crate::export_actions::current() {
                    return adapter.call(&path, name, options);
                }
                let bridge = match &mut self.file {
                    Some(bridge) => bridge,
                    None => self.file.insert(FileBridge::spawn(
                        &retained.network.node_executable,
                        &retained.network.bit_dir,
                    )?),
                };
                bridge.call(&path, name, options)
            }
            Remote::Http(url) => {
                let network = network(retained)?;
                let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
                runtime.block_on(network.action(&url, name, options))
            }
        }
    }
}

/// Resolves the remote host URL for `scope` and validates local directory structure for `file://` remotes.
#[inline]
pub(super) fn host(input: &Prepare, scope: &str) -> io::Result<String> {
    let host = configured_host(input, scope)?;
    match Remote::from_host(&host)? {
        Remote::File(path) => check_file_remote(&path, scope)?,
        Remote::Http(_) => {}
    }
    Ok(host)
}

/// Resolves the configured remote host URL for `scope` without filesystem checks.
#[inline]
pub(super) fn configured_host(input: &Prepare, scope: &str) -> io::Result<String> {
    Ok(super::hub::resolve(input, scope)?.host)
}

fn check_file_remote(path: &Path, scope: &str) -> io::Result<()> {
    let scope = scope.trim();
    if scope.is_empty() || !path.is_absolute() || !fs::symlink_metadata(path)?.is_dir() {
        return Err(invalid("outbound file remote path"));
    }
    let config: Value = crate::parse_jsonc(&fs::read(path.join("scope.json"))?)?;
    if config["name"].as_str().map(str::trim) != Some(scope) {
        return Err(invalid("outbound file remote scope"));
    }
    group::id(&config)?;
    Ok(())
}

pub(super) fn push(retained: &Retained, pending: &Pending) -> io::Result<()> {
    check_client_id(&retained.client_id)?;
    match Remote::from_host(&pending.host)? {
        Remote::File(path) => {
            push_file(&path, &pending.scope, &retained.client_id, &pending.objects)
        }
        Remote::Http(url) => push_http(retained, pending, &url),
    }
}

#[inline]
fn check_client_id(client: &str) -> io::Result<()> {
    let client = client.trim();
    if client.len() > 128
        || client.is_empty()
        || !client
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
    {
        return Err(invalid("outbound client id"));
    }
    Ok(())
}

fn push_file(
    path: &Path,
    scope: &str,
    client: &str,
    objects: &[tar::ObjectItem],
) -> io::Result<()> {
    check_file_remote(path, scope)?;
    let parent = path.join("pending-objects");
    fs::create_dir_all(&parent)?;
    if !fs::symlink_metadata(&parent)?.file_type().is_dir() {
        return Err(invalid("outbound pending directory"));
    }
    let pending = parent.join(client.trim());
    fs::create_dir(&pending)?;
    let result = write_pending(&pending, objects, group::owner(path, &pending)?);
    if result.is_err() {
        let _ = fs::remove_dir_all(&pending);
    }
    result
}

fn write_pending(
    pending: &Path,
    objects: &[tar::ObjectItem],
    owner: Option<(u32, u32)>,
) -> io::Result<()> {
    let store = crate::store::Store::new(pending.to_owned(), owner)?;
    let mut total = 0usize;
    for object in objects {
        let hash = crate::merge_history::hash(&object.hash)?;
        total = total
            .checked_add(object.compressed.len())
            .ok_or_else(|| invalid("outbound pending budget"))?;
        if total > MAX_BYTES {
            return Err(invalid("outbound pending budget"));
        }
        store.write(&crate::validate::hexadecimal(&hash), &object.compressed)?;
    }
    Ok(())
}

fn push_http(retained: &Retained, pending: &Pending, url: &str) -> io::Result<()> {
    let archive = tar::pack(&pending.objects, MAX_BYTES)?;
    let network = network(retained)?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let result = runtime.block_on(network.push(url, retained.client_id.trim(), archive))?;
    if !result.is_empty() {
        return Err(invalid("outbound unexpected push result"));
    }
    Ok(())
}

/// Use the resumable form of the canonical `ExportValidate` server action.
impl Actions {
    pub(super) fn validate(&mut self, retained: &Retained, pending: &Pending) -> io::Result<()> {
        let result = self.action(
            retained,
            pending,
            "ExportValidate",
            &json!({
                "clientId":retained.client_id.trim(),"isResumingExport":true
            }),
        )?;
        if !result.is_object() {
            return Err(invalid("outbound validation result"));
        }
        Ok(())
    }

    /// Match `persistRemotes`: retry any action failure at most three times.
    pub(super) fn persist(
        &mut self,
        retained: &Retained,
        pending: &Pending,
    ) -> io::Result<Vec<String>> {
        let mut last = None;
        for _ in 0..3 {
            let persisted = self.action(
                retained,
                pending,
                "ExportPersist",
                &json!({"clientId":retained.client_id.trim()}),
            );
            match persisted.and_then(persisted_ids) {
                Ok(ids) => return Ok(ids),
                Err(error) => last = Some(error),
            }
        }
        Err(io::Error::other(format!(
            "outbound persist failed: {}: {}",
            pending.scope,
            last.ok_or_else(|| invalid("outbound persist attempts"))?,
        )))
    }

    /// Clean pending objects after push or validate fails. Persist failures retain
    /// pending objects for the canonical resume-export recovery flow.
    pub(super) fn cleanup(&mut self, retained: &Retained, pending: &Pending) -> io::Result<()> {
        let result = self.action(
            retained,
            pending,
            "RemovePendingDir",
            &json!({"clientId":retained.client_id.trim()}),
        )?;
        if !result.is_object() {
            return Err(invalid("outbound cleanup result"));
        }
        Ok(())
    }
}

pub(super) fn network(retained: &Retained) -> io::Result<Network> {
    let config = &retained.network.global;
    let local: Value = crate::parse_jsonc(&fs::read(
        crate::scope_path(&retained.network.root).join("scope.json"),
    )?)?;
    let local_name = local["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("outbound local scope"))?;
    Network::new(
        config,
        &retained.network.bit_version,
        Some(local_name),
        retained.network.auth_token.as_deref(),
    )
}

/// The ids an `ExportPersist` action answered with.
#[inline]
fn persisted_ids(value: Value) -> io::Result<Vec<String>> {
    let Value::Array(ids) = value else { return Err(invalid("outbound persisted identities")) };
    ids.into_iter()
        .map(|id| {
            id.as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| invalid("outbound persisted identities"))
        })
        .collect()
}
