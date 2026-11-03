//! Export and fetch tar archive writing ([`write`], [`export_archive`], [`preflight`], [`wrappers`]) from frozen owned transfer [`Plan`]s.

use serde_json::{Value, json};
use sha1::Digest;
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

use super::{Plan, wire};
use crate::transfer::{Archive, Body, Descriptor, header, invalid, object, prepare};

/// Writes an export or fetch tar archive to `request.path` from a frozen owned transfer [`Plan`] via [`export_archive`] or [`fetch_archive`].
pub(super) fn write(plan: &Plan, request: &wire::Archive) -> io::Result<Value> {
    let fetch = match request.mode.as_deref().map(str::trim) {
        None | Some("" | "export") => false,
        Some("fetch") => true,
        _ => return Err(invalid("unsupported archive mode")),
    };
    let expected = plan.entries
        .len()
        .saturating_add(if fetch { 2 } else { 0 });
    if request.mtime_seconds.len() != expected
        || request.mtime_seconds
            .iter()
            .any(|seconds| *seconds > i32::MAX as u32)
    {
        return Err(invalid("archive mtime count or value differs"));
    }
    let parent = request.path.parent().ok_or_else(|| invalid("missing archive parent"))?;
    crate::transfer::paths(parent, &request.path)?;
    let wrappers = if fetch { Some(wrappers(plan, request)?) } else { None };
    let headers = preflight(plan, request, fetch)?;
    candidate(&request.path)?;
    if let Some(wrappers) = wrappers {
        return fetch_archive(plan, request, &wrappers, &headers);
    }
    export_archive(plan, request, parent)
}

/// Writes an export-mode tar archive from frozen [`Plan`] entries via [`prepare`] and verifies its objects hash.
fn export_archive(plan: &Plan, request: &wire::Archive, parent: &Path) -> io::Result<Value> {
    let descriptors = plan.entries
        .iter()
        .zip(&request.mtime_seconds)
        .map(|(entry, seconds)| Descriptor {
            hash: entry.hash,
            scope: entry.scope.clone(),
            seconds: *seconds,
            body: Body::Snapshot(entry.compressed.to_vec()),
        })
        .collect();
    let result = prepare(parent, &request.path, descriptors)?;
    if result.compressed_bytes
        != plan.entries
            .iter()
            .map(|entry| entry.compressed.len())
            .sum::<usize>()
        || result.objects_hash != plan.objects_hash
    {
        return Err(invalid("archive frozen-content identity differs"));
    }
    Ok(
        json!({"path":result.path,"count":result.count,"objectsHash":result.objects_hash,"bytes":result.archive_bytes,"sha1":result.archive_hash}),
    )
}

/// Encodes 512-byte `USTAR` tar headers for each entry in `plan` before writing the archive.
fn preflight(plan: &Plan, request: &wire::Archive, fetch: bool) -> io::Result<Vec<[u8; 512]>> {
    let offset = usize::from(fetch);
    let mut headers = Vec::with_capacity(plan.entries.len());
    for (index, entry) in plan.entries.iter().enumerate() {
        let descriptor = Descriptor {
            hash: entry.hash,
            scope: entry.scope.clone(),
            seconds: 0,
            body: Body::Repository,
        };
        headers.push(header::encode(
            &object::name(&descriptor)?,
            entry.compressed.len(),
            request.mtime_seconds[index + offset],
        )?);
    }
    Ok(headers)
}

/// Builds the `scope.json` and `index.json` wrapper payloads for a fetch-mode tar archive.
fn wrappers(plan: &Plan, request: &wire::Archive) -> io::Result<(Vec<u8>, Vec<u8>)> {
    let scope = request.scope_name
        .as_deref()
        .map(str::trim)
        .ok_or_else(|| invalid("missing fetch scope name"))?;
    if scope.is_empty()
        || scope.len() > 4096
        || scope.contains(char::is_control)
        || scope.contains(['/', '\\'])
        || scope.contains("..")
    {
        return Err(invalid("unsupported fetch scope name"));
    }
    let start =
        serde_json::to_vec(&json!({"schema":"1.0.0","scopeName":scope})).map_err(io::Error::other)?;
    let end = serde_json::to_vec(&json!({"numOfFiles":plan.entries.len(),"scopeName":scope}))
        .map_err(io::Error::other)?;
    Ok((start, end))
}

fn fetch_archive(
    plan: &Plan,
    request: &wire::Archive,
    wrappers: &(Vec<u8>, Vec<u8>),
    headers: &[[u8; 512]],
) -> io::Result<Value> {
    let mut writer = Archive::new(&request.path)?;
    let start = header::encode(".BIT.START", wrappers.0.len(), request.mtime_seconds[0])?;
    writer.entry(&start, &wrappers.0)?;
    for (header, entry) in headers.iter().zip(&plan.entries) {
        writer.entry(header, &entry.compressed)?;
    }
    let end = header::encode(
        ".BIT.END",
        wrappers.1.len(),
        *request.mtime_seconds.last().ok_or_else(|| invalid("missing fetch end mtime"))?,
    )?;
    writer.entry(&end, &wrappers.1)?;
    writer.write(&[0; 1024])?;
    writer.file.flush()?;
    writer.complete = true;
    Ok(
        json!({"path":request.path,"count":plan.entries.len(),"objectsHash":plan.objects_hash,"bytes":writer.bytes,"sha1":crate::validate::hexadecimal(&std::mem::take(&mut writer.digest).finalize())}),
    )
}

fn candidate(path: &std::path::Path) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Ok(metadata)
            if metadata.is_file() && !metadata.file_type().is_symlink() && metadata.len() == 0 =>
        {
            fs::remove_file(path)
        }
        _ => Err(invalid("archive candidate must be absent or private empty regular file")),
    }
}
