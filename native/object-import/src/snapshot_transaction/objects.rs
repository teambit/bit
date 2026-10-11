use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::HashSet,
    fs::OpenOptions,
    io::{self, Write},
    path::{Path, PathBuf},
};

use super::{MAX_RAW, invalid, source, wire};

pub(super) struct Prepared {
    pub(super) kind: String,
    pub(super) hash: String,
    pub(super) compressed: Vec<u8>,
    pub(super) inflated_size: usize,
    pub(super) path: PathBuf,
}

pub(super) fn prepare(objects: Vec<wire::Object>, pretty: bool) -> io::Result<Vec<Prepared>> {
    let mut total = 0;
    let mut compressed = 0;
    let mut input_compressed = 0;
    let mut hashes = HashSet::new();
    let mut output = Vec::new();
    for object in objects {
        let body = body(&object, pretty, MAX_RAW - total, &mut input_compressed)?;
        total += body.len();
        if total > MAX_RAW {
            return Err(invalid("snapshot raw budget"));
        }
        let hash = identity(&object)?;
        if !hashes.insert(hash.clone()) {
            return Err(invalid("duplicate snapshot hash"));
        }
        let prepared = encode(object.kind, hash, &body)?;
        compressed += prepared.compressed.len();
        if compressed > MAX_RAW {
            return Err(invalid("snapshot compressed budget"));
        }
        output.push(prepared);
    }
    Ok(output)
}

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
    if object.kind == "Source" {
        return object.hash.clone().ok_or_else(|| invalid("Source hash missing"));
    }
    let hash = crate::snapshot_projection::identity(
        &object.kind,
        object.fields.as_ref().ok_or_else(|| invalid("metadata fields missing"))?,
        object.hash.as_deref(),
    )?;
    if object.hash
        .as_ref()
        .is_some_and(|expected| *expected != hash)
    {
        return Err(invalid("metadata identity differs"));
    }
    Ok(hash)
}

fn encode(kind: String, hash: String, body: &[u8]) -> io::Result<Prepared> {
    let length = String::from_utf8_lossy(body).encode_utf16().count();
    let header = format!("{kind} {hash} {length}\0");
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
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
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&self.path)?
            .write_all(&self.compressed)
    }
}

#[cfg(test)]
#[path = "header_tests.rs"]
mod tests;
