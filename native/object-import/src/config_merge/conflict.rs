use super::{array, invalid, text};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

const MAX_BYTES: usize = 32 * 1024 * 1024;
static NEXT: AtomicUsize = AtomicUsize::new(0);
pub(crate) struct Conflict {
    token: String,
    path: PathBuf,
    contents: String,
}
struct Directory(PathBuf);
impl Directory {
    fn new() -> io::Result<Self> {
        for _ in 0..64 {
            let path = std::env::temp_dir()
                .join(format!(
                    "bit-config-{}-{}",
                    std::process::id(),
                    NEXT.fetch_add(1, Ordering::Relaxed),
                ));
            match fs::create_dir(&path) {
                Ok(()) => return Ok(Self(path)),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error),
            }
        }
        Err(invalid("config temporary directory"))
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _cleanup = fs::remove_dir_all(&self.0);
    }
}
pub(super) fn plan(input: &Value) -> io::Result<(Value, Conflict)> {
    let path = PathBuf::from(text(input, "path")?.trim());
    let fallback = PathBuf::from(text(input, "fallbackPath")?.trim());
    absolute(&path)?;
    absolute(&fallback)?;
    if path == fallback
        || !fs::symlink_metadata(&fallback)?.is_file()
        || fs::metadata(&fallback)?.len() != 0
    {
        return Err(invalid("config fallback candidate"));
    }
    let mut contents = read(&path)?;
    for field in ["dependencies", "peerDependencies"] {
        if input["conflicts"][field].is_null() {
            continue;
        }
        for entry in array(&input["conflicts"], field)? {
            replace(&mut contents, entry)?;
        }
    }
    let directory = Directory::new()?;
    let base = directory.0.join("base");
    let other = directory.0.join("other");
    fs::write(&base, "")?;
    fs::write(&other, &contents)?;
    let contents = crate::merge_history::merge::git::config_conflict([path.clone(), base, other])?;
    if contents.len() > MAX_BYTES {
        return Err(invalid("config output budget"));
    }
    candidate(&fallback, &contents)?;
    let digest = crate::validate::hexadecimal(&Sha1::digest(contents.as_bytes()));
    let mut token = Sha1::new();
    token.update(path.as_os_str().as_encoded_bytes());
    token.update(contents.as_bytes());
    let token = crate::validate::hexadecimal(&token.finalize());
    Ok((
        json!({"token":token,"ready":true,"bytes":contents.len(),"sha1":digest}),
        Conflict { token, path, contents },
    ))
}
pub(super) fn commit(input: &Value, pending: &mut Option<Conflict>) -> io::Result<Value> {
    let token = text(input, "token")?.trim();
    let path = PathBuf::from(text(input, "path")?.trim());
    if token.is_empty() {
        return Err(invalid("config conflict token"));
    }
    absolute(&path)?;
    let state = pending.as_ref().ok_or_else(|| invalid("no config conflict plan"))?;
    if state.token != token || state.path != path {
        return Err(invalid("stale config conflict plan"));
    }
    crate::merge_state::write::commit(&path, &state.contents)?;
    *pending = None;
    Ok(json!({"saved":true}))
}
fn read(path: &Path) -> io::Result<String> {
    let mut contents = Vec::new();
    fs::File::open(path)?
        .take((MAX_BYTES + 1) as u64)
        .read_to_end(&mut contents)?;
    if contents.len() > MAX_BYTES {
        return Err(invalid("config input budget"));
    }
    Ok(String::from_utf8_lossy(&contents).into_owned())
}
pub(super) fn render(contents: &str, conflicts: &Value) -> io::Result<String> {
    if contents.len() > MAX_BYTES {
        return Err(invalid("config input budget"));
    }
    let mut other = contents.to_owned();
    for field in ["dependencies", "peerDependencies"] {
        if conflicts[field].is_null() {
            continue;
        }
        for entry in array(conflicts, field)? {
            replace(&mut other, entry)?;
        }
    }
    let directory = Directory::new()?;
    let paths = [directory.0.join("current"), directory.0.join("base"), directory.0.join("other")];
    fs::write(&paths[0], contents)?;
    fs::write(&paths[1], "")?;
    fs::write(&paths[2], other)?;
    let result = crate::merge_history::merge::git::config_conflict(paths)?;
    if result.len() > MAX_BYTES {
        return Err(invalid("config output budget"));
    }
    Ok(result)
}
fn replace(contents: &mut String, entry: &Value) -> io::Result<()> {
    let name = text(entry, "name")?.trim();
    let version = text(entry, "version")?.trim();
    let mut parts = version.split("::");
    parts.next();
    let current = parts
        .next()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(|| invalid("config conflict current"))?;
    let other = parts
        .next()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(|| invalid("config conflict other"))?;
    let original = format!(r#""{name}": "{current}""#);
    if !contents.contains(&original) {
        return Err(invalid("config dependency substring missing"));
    }
    *contents = contents.replacen(&original, &format!(r#""{name}": "{other}""#), 1);
    if contents.len() > MAX_BYTES {
        return Err(invalid("config replacement budget"));
    }
    Ok(())
}
fn absolute(path: &Path) -> io::Result<()> {
    let bytes = path.as_os_str().as_encoded_bytes();
    if !path.is_absolute() || bytes.len() > 32768 || bytes.contains(&0) {
        return Err(invalid("config path"));
    }
    Ok(())
}

#[cfg(not(windows))]
fn candidate(path: &Path, contents: &str) -> io::Result<()> {
    crate::merge_state::write::commit(path, contents)
}
#[cfg(windows)]
fn candidate(path: &Path, contents: &str) -> io::Result<()> {
    use std::io::Write;
    absolute(path)?;
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.len() != 0 || contents.len() > MAX_BYTES {
        return Err(invalid("config private candidate changed"));
    }
    // The caller owns this empty temporary candidate, never a workspace target.
    // Recreate it exclusively so even a hard-linked empty candidate cannot cause
    // another inode alias to receive the conflict bytes. A raced replacement
    // fails create_new rather than following it or truncating another file.
    fs::remove_file(path)?;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?
        .write_all(contents.as_bytes())
}
