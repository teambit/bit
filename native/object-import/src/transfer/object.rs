use std::{
    fs::File,
    io::{self, Read},
    path::Path,
};

use super::{Body, Descriptor, invalid};

pub(super) fn name(item: &Descriptor) -> io::Result<String> {
    let hash = crate::validate::hexadecimal(&item.hash);
    match item.scope.as_deref().map(str::trim) {
        None => Ok(hash),
        Some(scope)
            if !scope.is_empty()
                && scope
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte)) =>
        {
            Ok(format!("{scope}/{hash}"))
        }
        _ => Err(invalid("unsupported transfer scope")),
    }
}

pub(crate) fn read(
    directory: &Path,
    item: &Descriptor,
    maximum: usize,
) -> io::Result<(Vec<u8>, usize, String)> {
    let body = match &item.body {
        Body::Metadata(bytes) | Body::Snapshot(bytes) if bytes.len() <= maximum => bytes.clone(),
        Body::Metadata(_) | Body::Snapshot(_) => {
            return Err(invalid("transfer bytes exceed bounds"));
        }
        Body::Repository => repository(directory, item.hash, maximum)?,
    };
    let outcome = crate::validate::validate(&body, item.hash);
    if outcome.status == "source" {
        if matches!(item.body, Body::Metadata(_)) {
            return Err(invalid("inline Source transfer is unsupported"));
        }
        return Ok((body, outcome.inflated_bytes, "Source".to_owned()));
    }
    metadata(&body, item.hash)?;
    let inflated = crate::metadata::inflate(&body).ok_or_else(|| invalid("invalid metadata"))?;
    let size = inflated.len();
    let (kind, _) = inflated.split_once(' ').ok_or_else(|| invalid("missing object kind"))?;
    Ok((body, size, kind.to_owned()))
}

pub(crate) fn repository(directory: &Path, hash: [u8; 20], maximum: usize) -> io::Result<Vec<u8>> {
    let identity = crate::validate::hexadecimal(&hash);
    let path = directory
        .join(&identity[..2])
        .join(&identity[2..]);
    let file = File::open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > maximum as u64 {
        return Err(invalid("transfer object exceeds bounds"));
    }
    let mut bytes = Vec::new();
    file.take((maximum + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > maximum {
        return Err(invalid("transfer bytes exceed bounds"));
    }
    Ok(bytes)
}

pub(crate) fn metadata(bytes: &[u8], hash: [u8; 20]) -> io::Result<serde_json::Value> {
    let inflated =
        crate::metadata::inflate(bytes).ok_or_else(|| invalid("unsupported transfer object"))?;
    let (header, body) =
        inflated.split_once('\0').ok_or_else(|| invalid("missing transfer header"))?;
    let fields = header.split(' ').collect::<Vec<_>>();
    if fields.len() != 3
        || fields[1] != crate::validate::hexadecimal(&hash)
        || fields[2].parse::<usize>().is_err()
        || !known(fields[0])
    {
        return Err(invalid("unsupported transfer object header"));
    }
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| invalid("invalid transfer metadata"))?;
    if !value.is_object() {
        return Err(invalid("transfer metadata is not an object"));
    }
    Ok(value)
}

fn known(kind: &str) -> bool {
    matches!(
        kind,
        "Version"
            | "Component"
            | "Lane"
            | "ScopeMeta"
            | "Symlink"
            | "VersionHistory"
            | "LaneHistory"
            | "ExportMetadata",
    )
}
