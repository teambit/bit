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

pub(super) struct Prepared {
    pub(super) kind: String,
    pub(super) hash: String,
    pub(super) compressed: Vec<u8>,
    pub(super) inflated_size: usize,
    pub(super) path: PathBuf,
}

pub(super) fn prepare(objects: Vec<wire::Object>, pretty: bool) -> io::Result<Vec<Prepared>> {
    let mut total = 0;
    let mut input_compressed = 0;
    let mut hashes = HashSet::new();
    let mut inputs = Vec::with_capacity(objects.len());
    for object in objects {
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
        .filter(|hash| !hash.is_empty());
    if object.kind == "Source" {
        return expected.map(str::to_owned).ok_or_else(|| invalid("Source hash missing"));
    }
    let hash = crate::snapshot_projection::identity(
        &object.kind,
        object.fields.as_ref().ok_or_else(|| invalid("metadata fields missing"))?,
        expected,
    )?;
    if expected.is_some_and(|expected_hash| expected_hash != hash) {
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
