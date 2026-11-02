//! Atomic output file writing ([`Emitted`]) and [`failure`] reporting for `bit compile`.
//!
//! Validates source files via [`validate_sources`] and writes compiled dist artifacts.

use super::Emitted;
use crate::commands::workspace_command::filesystem_error::failure;
use serde_json::Value;
use std::{
    fs,
    io::{self, Write},
    path::PathBuf,
};
/// Ensures every input source entry refers to a non-binary regular file on disk.
pub(super) fn validate_sources(files: &[Value]) -> io::Result<()> {
    for file in files {
        let path = file["absolutePath"]
            .as_str()
            .or_else(|| file["path"].as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| io::Error::other("compiler source path"))?;
        let source = file["source"]
            .as_str()
            .or_else(|| file["content"].as_str())
            .or_else(|| file["contents"].as_str())
            .unwrap_or_default();
        if source
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\t' | '\r' | '\n'))
        {
            return Err(io::Error::other("compiler binary source"));
        }
        let metadata = fs::symlink_metadata(path)?;
        if !metadata.is_file() || metadata.is_symlink() {
            return Err(io::Error::other("compiler source is not a regular file"));
        }
        if fs::read_to_string(path)? != source {
            return Err(io::Error::other("compiler source changed during preparation"));
        }
    }
    Ok(())
}
pub(super) fn remove(directories: &[PathBuf]) -> io::Result<()> {
    for directory in directories {
        if directory
            .as_os_str()
            .as_encoded_bytes()
            .iter()
            .all(u8::is_ascii_whitespace)
        {
            continue;
        }
        match fs::symlink_metadata(directory) {
            Ok(metadata) if metadata.is_dir() && !metadata.is_symlink() => {
                fs::remove_dir_all(directory)?;
            }
            Ok(_) => fs::remove_file(directory)?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}
pub(super) fn publish(files: &[Emitted], batch_size: usize) -> io::Result<()> {
    let batch_size = batch_size.max(1);
    for batch in files.chunks(batch_size) {
        let opened = open_batch(batch)?;
        for (file, mut opened) in batch.iter().zip(opened) {
            write_emitted_content(&mut opened, &file.content)
                .map_err(|error| failure(error, "write", &file.path))?;
        }
    }
    Ok(())
}
#[inline]
fn write_emitted_content(opened: &mut fs::File, content: &str) -> io::Result<()> {
    if !cfg!(windows) && !content.contains('\r') {
        return opened.write_all(content.as_bytes());
    }
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    let owned = if cfg!(windows) { normalized.replace('\n', "\r\n") } else { normalized };
    opened.write_all(owned.as_bytes())
}
// DataToPersist opens the pending batch concurrently. Even a failed first open can
// leave a later output truncated; do not complete its write after reporting that failure.
fn open_batch(files: &[Emitted]) -> io::Result<Vec<fs::File>> {
    let mut opened = Vec::with_capacity(files.len());
    let mut error = None;
    for file in files {
        match open_file(file) {
            Ok(file) => opened.push(file),
            Err(failure) if error.is_none() => error = Some(failure),
            Err(_) => {}
        }
    }
    error.map_or(Ok(opened), Err)
}
#[inline]
fn open_file(file: &Emitted) -> io::Result<fs::File> {
    let parent = file.path.parent().ok_or_else(|| io::Error::other("compiler output directory"))?;
    if !parent.as_os_str().is_empty() {
        fs::create_dir_all(parent).map_err(|error| failure(error, "mkdir", parent))?;
    }
    if fs::symlink_metadata(&file.path).is_ok_and(|metadata| metadata.is_symlink()) {
        fs::remove_file(&file.path).map_err(|error| failure(error, "unlink", &file.path))?;
    }
    fs::File::create(&file.path).map_err(|error| failure(error, "open", &file.path))
}
