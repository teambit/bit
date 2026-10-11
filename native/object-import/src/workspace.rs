use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    path::PathBuf,
};

use serde::Serialize;

use crate::protocol;

const MAX_FILES: u32 = 64;
const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_PATH: usize = 32_768;

struct File {
    path: PathBuf,
    overwrite: bool,
    contents: Vec<u8>,
}

#[derive(Serialize)]
struct Response {
    version: u8,
    id: u32,
    completed: usize,
    skipped: Vec<usize>,
    failed: bool,
}

/// Read and validate the complete frame before touching the workspace. A failed
/// write terminates the prefix; Node reproduces its canonical filesystem error.
pub(crate) fn serve(reader: &mut impl Read, writer: &mut impl Write) -> io::Result<()> {
    let id = protocol::word(reader)?;
    let files = request(reader)?;
    let mut response =
        Response { version: 1, id, completed: 0, skipped: Vec::new(), failed: false };
    let mut directories = HashSet::new();
    for (index, file) in files.iter().enumerate() {
        if let Ok(skipped) = materialize(file, &mut directories) {
            response.completed += 1;
            if skipped {
                response.skipped.push(index);
            }
        } else {
            response.failed = true;
            break;
        }
    }
    protocol::respond(writer, &response)
}

fn request(reader: &mut impl Read) -> io::Result<Vec<File>> {
    let count = protocol::word(reader)?;
    if !(1..=MAX_FILES).contains(&count) {
        return Err(invalid("workspace file count out of bounds"));
    }
    let mut files = Vec::with_capacity(count as usize);
    let mut total = 0;
    for _ in 0..count {
        let path = filename(reader)?;
        let overwrite = match protocol::word(reader)? {
            0 => false,
            1 => true,
            _ => return Err(invalid("invalid workspace overwrite flag")),
        };
        let length = protocol::word(reader)? as usize;
        total += length + path.as_os_str().len();
        if total > MAX_BYTES {
            return Err(invalid("workspace batch bytes out of bounds"));
        }
        let mut contents = vec![0; length];
        reader.read_exact(&mut contents)?;
        files.push(File { path, overwrite, contents });
    }
    Ok(files)
}

fn filename(reader: &mut impl Read) -> io::Result<PathBuf> {
    let length = protocol::word(reader)? as usize;
    if !(1..=MAX_PATH).contains(&length) {
        return Err(invalid("workspace path length out of bounds"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let name = String::from_utf8(bytes).map_err(|_| invalid("workspace path is not UTF-8"))?;
    let path = PathBuf::from(&name);
    if !path.is_absolute() || name.contains('\0') {
        return Err(invalid("workspace path must be absolute and contain no NUL"));
    }
    Ok(path)
}

fn materialize(file: &File, directories: &mut HashSet<PathBuf>) -> io::Result<bool> {
    // existsSync follows links and treats inaccessible/missing targets as absent.
    if !file.overwrite && file.path.exists() {
        return Ok(true);
    }
    if let Ok(metadata) = fs::metadata(&file.path)
        && !metadata.is_file()
    {
        return Err(invalid("workspace target is not a regular file"));
    }
    let parent = file.path.parent().ok_or_else(|| invalid("workspace file has no parent"))?;
    if !directories.contains(parent) {
        fs::create_dir_all(parent)?;
        directories.insert(parent.to_path_buf());
    }
    // In-place writes match outputFile: retain existing modes, ACLs, hard links
    // and symbolic-link targets. Atomic replacement would change those semantics.
    let mut output = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&file.path)?;
    output.write_all(&file.contents)?;
    Ok(false)
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

#[cfg(test)]
mod tests;
