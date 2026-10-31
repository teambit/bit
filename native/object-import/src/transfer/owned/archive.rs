use serde_json::{Value, json};
use std::{fs, io};

use super::{Plan, wire};
use crate::transfer::{Archive, Body, Descriptor, header, invalid, object, prepare};

pub(super) fn write(plan: &Plan, request: &wire::Archive) -> io::Result<Value> {
    let fetch = match request.mode.as_deref().map(str::trim) {
        None | Some("" | "export") => false,
        Some("fetch") => true,
        _ => return Err(invalid("unsupported archive mode")),
    };
    let expected = plan.entries.len() + if fetch { 2 } else { 0 };
    if request.mtime_seconds.len() != expected
        || request.mtime_seconds
            .iter()
            .any(|seconds| *seconds > i32::MAX as u32)
    {
        return Err(invalid("archive mtime count or value differs"));
    }
    crate::transfer::paths(
        request.path.parent().ok_or_else(|| invalid("missing archive parent"))?,
        &request.path,
    )?;
    let wrappers = if fetch { Some(wrappers(plan, request)?) } else { None };
    preflight(plan, request, fetch)?;
    candidate(&request.path)?;
    if let Some(wrappers) = wrappers {
        return fetch_archive(plan, request, &wrappers);
    }
    export_archive(plan, request)
}

fn export_archive(plan: &Plan, request: &wire::Archive) -> io::Result<Value> {
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
    let result = prepare(
        request.path.parent().ok_or_else(|| invalid("missing archive parent"))?,
        &request.path,
        descriptors,
    )?;
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

fn preflight(plan: &Plan, request: &wire::Archive, fetch: bool) -> io::Result<()> {
    let offset = usize::from(fetch);
    for (index, entry) in plan.entries.iter().enumerate() {
        let descriptor = Descriptor {
            hash: entry.hash,
            scope: entry.scope.clone(),
            seconds: 0,
            body: Body::Repository,
        };
        header::encode(
            &object::name(&descriptor)?,
            entry.compressed.len(),
            request.mtime_seconds[index + offset],
        )?;
    }
    Ok(())
}

fn wrappers(plan: &Plan, request: &wire::Archive) -> io::Result<(Vec<u8>, Vec<u8>)> {
    let scope = request.scope_name
        .as_deref()
        .map(str::trim)
        .ok_or_else(|| invalid("missing fetch scope name"))?;
    if scope.is_empty() || scope.len() > 4096 || scope.contains('\0') {
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
) -> io::Result<Value> {
    let mut writer = Archive::new(&request.path)?;
    let start = header::encode(".BIT.START", wrappers.0.len(), request.mtime_seconds[0])?;
    writer.entry(&start, &wrappers.0)?;
    for (index, entry) in plan.entries.iter().enumerate() {
        let descriptor = Descriptor {
            hash: entry.hash,
            scope: entry.scope.clone(),
            seconds: 0,
            body: Body::Repository,
        };
        let name = object::name(&descriptor)?;
        let header =
            header::encode(&name, entry.compressed.len(), request.mtime_seconds[index + 1])?;
        writer.entry(&header, &entry.compressed)?;
    }
    let end = header::encode(
        ".BIT.END",
        wrappers.1.len(),
        *request.mtime_seconds.last().ok_or_else(|| invalid("missing fetch end mtime"))?,
    )?;
    writer.entry(&end, &wrappers.1)?;
    writer.write(&[0; 1024])?;
    use std::io::Write;
    writer.file.flush()?;
    writer.complete = true;
    use sha1::Digest;
    Ok(
        json!({"path":request.path,"count":plan.entries.len(),"objectsHash":plan.objects_hash,"bytes":writer.bytes,"sha1":crate::validate::hexadecimal(&writer.digest.clone().finalize())}),
    )
}

fn candidate(path: &std::path::Path) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Ok(metadata) if metadata.is_file() && metadata.len() == 0 => fs::remove_file(path),
        _ => Err(invalid("archive candidate must be absent or private empty regular file")),
    }
}
