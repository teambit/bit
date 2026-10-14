//! Direct client-side pending transfer. Server actions remain canonical.
use super::{Prepare, Retained, invalid};
use bit_client_transfer::{GlobalConfig, http::Network, remotes::Remote, tar};
use serde_json::Value;
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

const MAX_BYTES: usize = 32 * 1024 * 1024;

pub(super) fn host(input: &Prepare, scope: &str) -> io::Result<String> {
    let host = configured_host(input, scope)?;
    match Remote::from_host(&host)? {
        Remote::File(path) => check_file_remote(&path, scope)?,
        Remote::Http(_) => {}
    }
    // The non-hub original-scope route is the same with or without -o.
    Ok(host)
}

pub(super) fn configured_host(input: &Prepare, scope: &str) -> io::Result<String> {
    let local: Value = serde_json::from_slice(&fs::read(input.root.join(".bit/scope.json"))?)?;
    if let Some(host) = local["remotes"][scope].as_str() {
        return Ok(host.to_owned());
    }
    let globals: Value = match fs::read(&input.global_remotes_file) {
        Ok(bytes) => serde_json::from_slice(&bytes)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => Value::Null,
        Err(error) => return Err(error),
    };
    globals[scope]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| invalid("outbound unconfigured or hub remote"))
}

fn check_file_remote(path: &Path, scope: &str) -> io::Result<()> {
    if !path.is_absolute() || !fs::symlink_metadata(path)?.is_dir() {
        return Err(invalid("outbound file remote path"));
    }
    let config: Value = serde_json::from_slice(&fs::read(path.join("scope.json"))?)?;
    if config["name"] != scope {
        return Err(invalid("outbound file remote scope"));
    }
    Ok(())
}

pub(super) fn push(retained: &Retained, scope: &str, host: &str) -> io::Result<()> {
    if retained.pending.client_id.len() > 128
        || retained.pending.client_id.is_empty()
        || !retained.pending.client_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return Err(invalid("outbound client id"));
    }
    match Remote::from_host(host)? {
        Remote::File(path) => {
            push_file(&path, scope, &retained.pending.client_id, &retained.pending.objects)
        }
        Remote::Http(url) => push_http(retained, scope, &url),
    }
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
    let pending = parent.join(client);
    fs::create_dir(&pending)?;
    let result = write_pending(&pending, objects);
    if result.is_err() {
        let _ = fs::remove_dir_all(&pending);
    }
    result
}

fn write_pending(pending: &Path, objects: &[tar::ObjectItem]) -> io::Result<()> {
    let mut total = 0usize;
    for object in objects {
        let hash = crate::merge_history::hash(&object.hash)?;
        total = total
            .checked_add(object.compressed.len())
            .ok_or_else(|| invalid("outbound pending budget"))?;
        if total > MAX_BYTES {
            return Err(invalid("outbound pending budget"));
        }
        let digest = crate::validate::hexadecimal(&hash);
        let path = pending
            .join(&digest[..2])
            .join(&digest[2..]);
        fs::create_dir_all(path.parent().ok_or_else(|| invalid("outbound pending parent"))?)?;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)?;
        file.write_all(&object.compressed)?;
    }
    Ok(())
}

fn push_http(retained: &Retained, _scope: &str, url: &str) -> io::Result<()> {
    let archive = tar::pack(&retained.pending.objects, MAX_BYTES)?;
    let config: GlobalConfig =
        match fs::read(retained.network.global_config_dir.join("config.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes)?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => GlobalConfig::new(),
            Err(error) => return Err(error),
        };
    let local: Value = serde_json::from_slice(&fs::read(retained.root.join(".bit/scope.json"))?)?;
    let local_name = local["name"].as_str().ok_or_else(|| invalid("outbound local scope"))?;
    let network = Network::new(
        &config,
        &retained.network.bit_version,
        Some(local_name),
        retained.network.auth_token.as_deref(),
    )?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let result = runtime.block_on(network.push(url, &retained.pending.client_id, archive))?;
    if !result.is_empty() {
        return Err(invalid("outbound unexpected push result"));
    }
    Ok(())
}
