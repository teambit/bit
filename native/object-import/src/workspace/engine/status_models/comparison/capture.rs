use super::{Request, Target, invalid};
use crate::workspace::engine::read;
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(super) fn all(request: &Request, pool: &rayon::ThreadPool) -> io::Result<Vec<Value>> {
    let mut paths = Vec::new();
    let mut identities = HashSet::new();
    for target in &request.targets {
        validate(target)?;
        if !identities.insert(&target.identity) {
            return Err(invalid("status comparison duplicate identity"));
        }
        paths.extend(
            target.files
                .iter()
                .map(|file| request.root.join(&target.directory).join(file)),
        );
    }
    let bitmap = request.root.join(".bitmap");
    let captured = read::read_with(&paths, pool, |path, bytes| capture(path, bytes, &bitmap))?
        .into_iter()
        .collect::<io::Result<Vec<_>>>()?;
    if captured
        .iter()
        .map(|file| file.raw_bytes)
        .sum::<usize>()
        > super::super::super::MAX_RAW
    {
        return Err(invalid("status normalized source budget"));
    }
    let mut captured = captured.into_iter();
    Ok(request.targets.iter().map(|target| Value::Array(target.files.iter().map(|file| {
        let metadata = captured.next().expect("one captured file per path");
        json!({"relativePath":file,"name":file.rsplit('/').next(),"test":false,"file":metadata.linux_hash})
    }).collect())).collect())
}
fn capture(path: &Path, bytes: Vec<u8>, bitmap: &Path) -> io::Result<read::Metadata> {
    let original = bytes.len();
    let bytes = if path == bitmap {
        crate::inspection::normalize_bitmap(&read::strip_bom(bytes))?
    } else {
        bytes
    };
    let mut metadata = read::canonical(path, bytes).0;
    metadata.raw_bytes = metadata.raw_bytes.max(original);
    Ok(metadata)
}

pub(in crate::workspace::engine) fn validate(target: &Target) -> io::Result<()> {
    if target.directory != "." {
        relative(&target.directory)?;
    }
    let mut seen = HashSet::new();
    for file in &target.files {
        relative(file)?;
        if !seen.insert(file) {
            return Err(invalid("status comparison duplicate file"));
        }
    }
    let fields =
        target.current.as_object().ok_or_else(|| invalid("status comparison current fields"))?;
    if fields
        .keys()
        .any(|field| {
            !matches!(
                field.as_str(),
                "mainFile"
                    | "dependencies"
                    | "devDependencies"
                    | "packageDependencies"
                    | "devPackageDependencies"
                    | "peerPackageDependencies"
                    | "bindingPrefix"
                    | "overrides"
                    | "extensions",
            )
        })
    {
        return Err(invalid("status comparison unknown current field"));
    }
    relative(
        fields
            .get("mainFile")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("status comparison main file"))?,
    )
}
fn relative(value: &str) -> io::Result<()> {
    if value.is_empty()
        || value.len() > 32768
        || value.contains(['\\', ':', '\0'])
        || value
            .split('/')
            .any(|part| matches!(part, "" | "." | ".."))
    {
        return Err(invalid("status comparison relative path"));
    }
    Ok(())
}
