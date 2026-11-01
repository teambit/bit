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
                && scope.len() <= 256
                && !scope.contains("..")
                && scope != "."
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
    let (_, size, kind) = parse_metadata(&body, item.hash)?;
    Ok((body, size, kind))
}

pub(crate) fn repository(directory: &Path, hash: [u8; 20], maximum: usize) -> io::Result<Vec<u8>> {
    let identity = crate::validate::hexadecimal(&hash);
    let path = directory
        .join(&identity[..2])
        .join(&identity[2..]);
    if path.parent().is_none_or(Path::is_symlink) {
        return Err(invalid("transfer object exceeds bounds"));
    }
    let link_meta = std::fs::symlink_metadata(&path)?;
    if !link_meta.is_file() || link_meta.file_type().is_symlink() {
        return Err(invalid("transfer object exceeds bounds"));
    }
    let file = File::open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > maximum as u64 {
        return Err(invalid("transfer object exceeds bounds"));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take((maximum + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > maximum {
        return Err(invalid("transfer bytes exceed bounds"));
    }
    Ok(bytes)
}

pub(crate) fn metadata(bytes: &[u8], hash: [u8; 20]) -> io::Result<serde_json::Value> {
    parse_metadata(bytes, hash).map(|(value, _, _)| value)
}

fn parse_metadata(bytes: &[u8], hash: [u8; 20]) -> io::Result<(serde_json::Value, usize, String)> {
    let inflated =
        crate::metadata::inflate(bytes).ok_or_else(|| invalid("unsupported transfer object"))?;
    let (header, body) =
        inflated.split_once('\0').ok_or_else(|| invalid("missing transfer header"))?;
    let mut fields = header.split(' ');
    let (Some(kind), Some(raw_hash), Some(raw_len), None) =
        (fields.next(), fields.next(), fields.next(), fields.next())
    else {
        return Err(invalid("unsupported transfer object header"));
    };
    let declared =
        raw_len.parse::<usize>().map_err(|_| invalid("unsupported transfer object header"))?;
    if !raw_hash.eq_ignore_ascii_case(&crate::validate::hexadecimal(&hash))
        || (declared != body.len() && declared != body.encode_utf16().count())
        || !known(kind)
    {
        return Err(invalid("unsupported transfer object header"));
    }
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| invalid("invalid transfer metadata"))?;
    if !value.is_object() {
        return Err(invalid("transfer metadata is not an object"));
    }
    Ok((value, inflated.len(), kind.to_owned()))
}

#[inline]
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
