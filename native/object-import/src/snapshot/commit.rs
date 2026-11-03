//! Zlib-compressed repository object serialization ([`Object`], [`Kind`], [`Prepared`], [`Written`], [`commit`]) and atomic [`Store`] writes for snapshot commits.

use super::{MAX_RAW, Response, count, hash, invalid, path};
use crate::store::Store;
use flate2::{Compression, write::ZlibEncoder};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha1::{Digest, Sha1};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};
/// Single repository object descriptor (`type`, `hash`, `body`, `workspace`) in a snapshot commit.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Object {
    #[serde(rename = "type")]
    kind: Kind,
    hash: String,
    body: Option<String>,
    workspace: Option<Workspace>,
}
/// Supported repository object kind in a `BSS1` snapshot commit request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum Kind {
    Source,
    Version,
    Component,
    Lane,
    ScopeMeta,
    Symlink,
    VersionHistory,
    LaneHistory,
    ExportMetadata,
}
impl Kind {
    /// Returns the canonical repository header type name for `self`.
    #[inline]
    #[must_use]
    const fn name(self) -> &'static str {
        match self {
            Self::Source => "Source",
            Self::Version => "Version",
            Self::Component => "Component",
            Self::Lane => "Lane",
            Self::ScopeMeta => "ScopeMeta",
            Self::Symlink => "Symlink",
            Self::VersionHistory => "VersionHistory",
            Self::LaneHistory => "LaneHistory",
            Self::ExportMetadata => "ExportMetadata",
        }
    }
}
/// Workspace file `path` and expected SHA-1 `hash` for a `Source` object in a snapshot commit.
#[derive(Debug, Default, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Workspace {
    path: PathBuf,
    hash: String,
}
/// Zlib-compressed loose object bytes and inflated size prepared for [`Store::write`].
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct Prepared {
    hash: String,
    compressed: Vec<u8>,
    inflated_size: usize,
}
/// Serialized summary of a committed snapshot object (`hash`, `inflatedSize`, `compressedSize`).
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Written {
    hash: String,
    inflated_size: usize,
    compressed_size: usize,
}

/// Validates, compresses, and atomically writes `objects` into `directory` via [`Store`].
pub(super) fn commit(
    id: u32,
    directory: &Path,
    owner: Option<(u32, u32)>,
    objects: &[Object],
) -> io::Result<Response> {
    path(directory)?;
    count(objects.len())?;
    let prepared = preflight(objects)?;
    let store = Store::new(directory.to_path_buf(), owner)?;
    let mut written = Vec::with_capacity(prepared.len());
    for object in prepared {
        if store.write(&object.hash, &object.compressed).is_err() {
            break;
        }
        written.push(Written {
            hash: object.hash,
            inflated_size: object.inflated_size,
            compressed_size: object.compressed.len(),
        });
    }
    Ok(Response {
        version: 1,
        id,
        completed: written.len(),
        skipped: Vec::new(),
        failed: written.len() != objects.len(),
        data: Some(json!({"written":written})),
    })
}
fn preflight(objects: &[Object]) -> io::Result<Vec<Prepared>> {
    let mut total = 0_usize;
    let mut bodies = 0_usize;
    let mut found = HashSet::with_capacity(objects.len());
    let mut prepared = Vec::with_capacity(objects.len());
    for object in objects {
        hash(&object.hash)?;
        if !found.insert(object.hash.trim()) {
            return Err(invalid("snapshot duplicate object hash"));
        }
        let body = body(object, MAX_RAW.saturating_sub(total))?;
        total = total.saturating_add(body.0);
        bodies = bodies.saturating_add(body.1.len());
        if total > MAX_RAW || bodies > MAX_RAW {
            return Err(invalid("snapshot raw byte limit"));
        }
        prepared.push(prepare(object, &body.1)?);
    }
    Ok(prepared)
}
fn body(object: &Object, maximum: usize) -> io::Result<(usize, Vec<u8>)> {
    match (&object.body, &object.workspace) {
        (Some(body), None) => {
            let body = decode(body, maximum)?;
            validate_body(object, &body)?;
            Ok((body.len(), body))
        }
        (None, Some(workspace)) if matches!(object.kind, Kind::Source) => {
            let mut raw = read(workspace, maximum)?;
            let size = raw.len();
            if raw.starts_with(b"\xef\xbb\xbf") {
                raw.drain(..3);
            }
            let body = crate::checkout::eol::normalize(raw, false);
            validate_body(object, &body)?;
            Ok((size, body))
        }
        _ => Err(invalid("snapshot unsupported object body")),
    }
}
fn validate_body(object: &Object, body: &[u8]) -> io::Result<()> {
    if matches!(object.kind, Kind::Source) {
        if crate::validate::hexadecimal(&Sha1::digest(body)) != object.hash.trim() {
            return Err(invalid("snapshot Source identity changed"));
        }
    } else if !crate::parse_jsonc(body).is_ok_and(|value| value.is_object()) {
        return Err(invalid("snapshot metadata must be a JSON object"));
    }
    Ok(())
}
fn decode(body: &str, maximum: usize) -> io::Result<Vec<u8>> {
    let body = body.trim();
    if !body.len().is_multiple_of(2) || body.len() / 2 > maximum {
        return Err(invalid("snapshot body hex limit"));
    }
    body.as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let digit = |byte| match byte {
                b'0'..=b'9' => Ok(byte - b'0'),
                b'a'..=b'f' => Ok(byte - b'a' + 10),
                b'A'..=b'F' => Ok(byte - b'A' + 10),
                _ => Err(invalid("snapshot invalid body hex")),
            };
            Ok(digit(pair[0])? * 16 + digit(pair[1])?)
        })
        .collect()
}
fn read(workspace: &Workspace, maximum: usize) -> io::Result<Vec<u8>> {
    path(&workspace.path)?;
    hash(&workspace.hash)?;
    let link_meta = fs::symlink_metadata(&workspace.path)?;
    if !link_meta.is_file()
        || link_meta.file_type().is_symlink()
        || workspace.path.parent().is_none_or(Path::is_symlink)
    {
        return Err(invalid("snapshot workspace file type"));
    }
    let file = File::open(&workspace.path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > maximum as u64 {
        return Err(invalid("snapshot workspace byte limit"));
    }
    let mut raw = Vec::with_capacity(usize::try_from(metadata.len()).unwrap_or(0));
    file.take((maximum + 1) as u64)
        .read_to_end(&mut raw)?;
    if raw.len() > maximum
        || crate::validate::hexadecimal(&Sha1::digest(&raw)) != workspace.hash.trim()
    {
        return Err(invalid("snapshot workspace identity changed"));
    }
    Ok(raw)
}
fn prepare(object: &Object, body: &[u8]) -> io::Result<Prepared> {
    let hash = object.hash.trim();
    let length = if body.is_ascii() {
        body.len()
    } else {
        String::from_utf8_lossy(body).encode_utf16().count()
    };
    let header = format!("{} {hash} {length}\0", object.kind.name());
    let mut encoder = ZlibEncoder::new(Vec::with_capacity(64), Compression::default());
    encoder.write_all(header.as_bytes())?;
    encoder.write_all(body)?;
    Ok(Prepared {
        hash: hash.to_owned(),
        compressed: encoder.finish()?,
        inflated_size: header.len() + body.len(),
    })
}
