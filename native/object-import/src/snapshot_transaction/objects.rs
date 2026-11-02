//! Parallel zlib compression and staging-file preparation ([`Prepared`], [`prepare`]) for snapshot transaction objects.

#[cfg(test)]
#[path = "header_tests.rs"]
mod tests;

use flate2::{Compression, write::ZlibEncoder};
use rayon::prelude::*;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::HashSet,
    fs::OpenOptions,
    io::{self, Write},
    path::{Path, PathBuf},
};

use super::{MAX_RAW, invalid, source, wire};

/// Zlib-compressed snapshot object with its SHA-1 `hash`, `inflated_size`, and staging `path`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Prepared {
    pub(super) kind: String,
    pub(super) hash: String,
    pub(super) compressed: Vec<u8>,
    pub(super) inflated_size: usize,
    pub(super) path: PathBuf,
}

/// Validates, projects, and zlib-compresses `objects` into [`Prepared`] snapshot records.
pub(super) fn prepare(objects: Vec<wire::Object>, pretty: bool) -> io::Result<Vec<Prepared>> {
    let mut total = 0;
    let mut input_compressed = 0;
    let mut hashes = HashSet::with_capacity(objects.len());
    let mut inputs = Vec::with_capacity(objects.len());
    for mut object in objects {
        if object.kind.len() != object.kind.trim().len() {
            object.kind = object.kind.trim().into();
        }
        if object.kind.is_empty() {
            return Err(invalid("snapshot object kind missing"));
        }
        let body = body(&object, pretty, MAX_RAW.saturating_sub(total), &mut input_compressed)?;
        total = total.saturating_add(body.len());
        if total > MAX_RAW {
            return Err(invalid("snapshot raw budget"));
        }
        let hash = identity(&object)?;
        if !hashes.insert(hash.clone()) {
            return Err(invalid("duplicate snapshot hash"));
        }
        inputs.push((object.kind, hash, body));
    }
    compress(inputs, total)
}

/// Zlib-compresses `(kind, hash, body)` `inputs` serially or in parallel within [`MAX_RAW`].
fn compress(inputs: Vec<(String, String, Vec<u8>)>, bytes: usize) -> io::Result<Vec<Prepared>> {
    // Validate and bound all source reads before scheduling CPU work. Indexed collection
    // preserves manifest order; persistence still acknowledges only an ordered prefix.
    // Tiny transactions avoid worker scheduling, and the raw input stays within MAX_RAW.
    let encode_input = |(kind, hash, body): (String, String, Vec<u8>)| encode(kind, hash, &body);
    let results: Vec<_> = if inputs.len() > 1 && bytes >= 64 * 1024 {
        inputs
            .into_par_iter()
            .map(encode_input)
            .collect()
    } else {
        inputs
            .into_iter()
            .map(encode_input)
            .collect()
    };
    let mut compressed: usize = 0;
    results
        .into_iter()
        .map(|result| {
            let prepared = result?;
            compressed = compressed.saturating_add(prepared.compressed.len());
            if compressed > MAX_RAW {
                return Err(invalid("snapshot compressed budget"));
            }
            Ok(prepared)
        })
        .collect()
}

/// Reads or serializes the raw uncompressed body bytes for `object` within `maximum` bytes.
fn body(
    object: &wire::Object,
    pretty: bool,
    maximum: usize,
    compressed: &mut usize,
) -> io::Result<Vec<u8>> {
    if object.kind == "Source" {
        return source::read(object, maximum, compressed);
    }
    if object.source.is_some() || object.repository.is_some() || object.body.is_some() {
        return Err(invalid("metadata raw projection required"));
    }
    crate::snapshot_projection::serialize(
        &object.kind,
        object.fields.as_ref().ok_or_else(|| invalid("metadata fields missing"))?,
        pretty,
    )
}

fn identity(object: &wire::Object) -> io::Result<String> {
    let expected = object.hash
        .as_deref()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .map(str::to_ascii_lowercase);
    if object.kind == "Source" {
        return expected.ok_or_else(|| invalid("Source hash missing"));
    }
    let hash = crate::snapshot_projection::identity(
        &object.kind,
        object.fields.as_ref().ok_or_else(|| invalid("metadata fields missing"))?,
        expected.as_deref(),
    )?;
    if expected
        .as_deref()
        .is_some_and(|expected_hash| !expected_hash.eq_ignore_ascii_case(&hash))
    {
        return Err(invalid("metadata identity differs"));
    }
    Ok(hash)
}

fn encode(kind: String, hash: String, body: &[u8]) -> io::Result<Prepared> {
    let length = if body.is_ascii() {
        body.len()
    } else {
        String::from_utf8_lossy(body).encode_utf16().count()
    };
    let header = format!("{kind} {hash} {length}\0");
    let mut encoder = ZlibEncoder::new(Vec::with_capacity(64), Compression::default());
    encoder.write_all(header.as_bytes())?;
    encoder.write_all(body)?;
    Ok(Prepared {
        kind,
        hash,
        compressed: encoder.finish()?,
        inflated_size: header.len() + body.len(),
        path: PathBuf::new(),
    })
}

pub(super) fn paths(mut objects: Vec<Prepared>, directory: &Path, token: &str) -> Vec<Prepared> {
    for (index, object) in objects.iter_mut().enumerate() {
        object.path = directory.join(format!("{token}-{index}.object"));
    }
    objects
}

pub(super) fn manifest(objects: &[Prepared]) -> Vec<Value> {
    objects.iter().map(|object|json!({"type":object.kind,"hash":object.hash,"inflatedSize":object.inflated_size,"compressedSize":object.compressed.len(),"compressedPath":object.path,"compressedSha1":crate::validate::hexadecimal(&Sha1::digest(&object.compressed))})).collect()
}

impl Prepared {
    pub(super) fn spool(&self) -> io::Result<()> {
        if self.path.is_symlink() || self.path.parent().is_none_or(Path::is_symlink) {
            return Err(invalid("snapshot staging symlink"));
        }
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&self.path)?
            .write_all(&self.compressed)
    }
}
