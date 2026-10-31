#[cfg(test)]
#[path = "source_tests.rs"]
mod tests;

use sha1::{Digest, Sha1};
use std::{
    fs::File,
    io::{self, Read},
};

use super::{MAX_RAW, invalid, path, wire};

pub(super) fn read(
    object: &wire::Object,
    maximum: usize,
    compressed: &mut usize,
) -> io::Result<Vec<u8>> {
    let bytes = match (&object.source, &object.repository, &object.body, &object.fields) {
        (Some(source), None, None, None) => workspace(source, maximum)?,
        (None, Some(repository), None, None) => {
            path(&repository.objects_directory)?;
            crate::checkout::repository::source(
                &repository.objects_directory,
                crate::merge_history::hash(&repository.hash)?,
                maximum,
                compressed,
            )?
        }
        (None, None, Some(body), None) => hex(body, maximum)?,
        _ => return Err(invalid("unsupported Source input")),
    };
    let hash = object.hash
        .as_deref()
        .map(str::trim)
        .ok_or_else(|| invalid("Source hash missing"))?;
    crate::merge_history::hash(hash)?;
    if crate::validate::hexadecimal(&Sha1::digest(&bytes)) != hash {
        return Err(invalid("snapshot Source identity differs"));
    }
    Ok(bytes)
}

fn workspace(source: &wire::Workspace, maximum: usize) -> io::Result<Vec<u8>> {
    path(&source.path)?;
    crate::merge_history::hash(&source.hash)?;
    crate::merge_history::hash(&source.source_hash)?;
    let metadata = std::fs::symlink_metadata(&source.path)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > maximum as u64 {
        return Err(invalid("snapshot workspace size/type"));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(&source.path)?
        .take((maximum + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > maximum || crate::validate::hexadecimal(&Sha1::digest(&bytes)) != source.hash {
        return Err(invalid("workspace snapshot differs"));
    }
    if source.normalization == wire::Normalization::Workspace && bytes.starts_with(&[239, 187, 191])
    {
        bytes.drain(..3);
    }
    let bytes = crate::checkout::eol::normalize(bytes, false);
    if crate::validate::hexadecimal(&Sha1::digest(&bytes)) != source.source_hash {
        return Err(invalid("normalized Source identity differs"));
    }
    Ok(bytes)
}

fn hex(text: &str, maximum: usize) -> io::Result<Vec<u8>> {
    if text.len() > maximum.min(MAX_RAW) * 2
        || !text.len().is_multiple_of(2)
        || !text.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(invalid("Source body encoding limit"));
    }
    text.as_bytes()
        .chunks_exact(2)
        .map(|chunk| {
            u8::from_str_radix(std::str::from_utf8(chunk).map_err(io::Error::other)?, 16)
                .map_err(io::Error::other)
        })
        .collect()
}
