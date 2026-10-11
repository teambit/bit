use std::{
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

use serde_json::Value;

use super::serve;

static NEXT: AtomicUsize = AtomicUsize::new(0);

struct Directory(PathBuf);

impl Directory {
    fn new() -> Self {
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("bit-workspace-{}-{id}", std::process::id()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}

impl Drop for Directory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

fn request(files: &[(&Path, bool, &[u8])]) -> Vec<u8> {
    let mut bytes = 19_u32.to_be_bytes().to_vec();
    bytes.extend_from_slice(&(files.len() as u32).to_be_bytes());
    for (path, overwrite, contents) in files {
        let name = path.to_str().unwrap().as_bytes();
        bytes.extend_from_slice(&(name.len() as u32).to_be_bytes());
        bytes.extend_from_slice(name);
        bytes.extend_from_slice(&u32::from(*overwrite).to_be_bytes());
        bytes.extend_from_slice(&(contents.len() as u32).to_be_bytes());
        bytes.extend_from_slice(contents);
    }
    bytes
}

fn response(bytes: Vec<u8>) -> Value {
    let mut output = Vec::new();
    serve(&mut Cursor::new(bytes), &mut output).unwrap();
    serde_json::from_slice(&output).unwrap()
}

#[test]
fn creates_nested_empty_and_binary_files() {
    let directory = Directory::new();
    let empty = directory.0.join("nested/empty");
    let binary = directory.0.join("nested/deeper/日本語");
    let result = response(request(&[(&empty, true, b""), (&binary, true, b"\0\xff\r\n")]));
    assert_eq!(result["completed"], 2);
    assert_eq!(result["failed"], false);
    assert_eq!(fs::read(empty).unwrap(), b"");
    assert_eq!(fs::read(binary).unwrap(), b"\0\xff\r\n");
}

#[test]
fn skips_existing_files_and_directories_without_overwrite() {
    let directory = Directory::new();
    let file = directory.0.join("file");
    fs::write(&file, b"original").unwrap();
    let result = response(request(&[(&file, false, b"replacement"), (&directory.0, false, b"x")]));
    assert_eq!(result["completed"], 2);
    assert_eq!(result["skipped"], serde_json::json!([0, 1]));
    assert_eq!(fs::read(file).unwrap(), b"original");
}

#[test]
fn stops_after_first_failed_file() {
    let directory = Directory::new();
    let first = directory.0.join("first");
    let last = directory.0.join("last");
    let result = response(request(&[
        (&first, true, b"ok"),
        (&directory.0, true, b"bad"),
        (&last, true, b"no"),
    ]));
    assert_eq!(result["completed"], 1);
    assert_eq!(result["failed"], true);
    assert_eq!(fs::read(first).unwrap(), b"ok");
    assert!(!last.exists());
}

#[test]
fn incomplete_frames_never_write_a_prefix() {
    let directory = Directory::new();
    let first = directory.0.join("first");
    let second = directory.0.join("second");
    let bytes = request(&[(&first, true, b"a"), (&second, true, b"b")]);
    for length in 0..bytes.len() {
        let mut output = Vec::new();
        assert!(serve(&mut Cursor::new(&bytes[..length]), &mut output).is_err());
        assert!(output.is_empty());
        assert!(!first.exists());
    }
}

#[test]
fn rejects_relative_paths_and_invalid_flags_before_writes() {
    let directory = Directory::new();
    let first = directory.0.join("first");
    let relative = Path::new("relative");
    let bytes = request(&[(&first, true, b"a"), (relative, true, b"b")]);
    assert!(serve(&mut Cursor::new(bytes), &mut Vec::new()).is_err());
    assert!(!first.exists());
    let mut bytes = request(&[(&first, true, b"a")]);
    let flag = 12 + first.to_str().unwrap().len();
    bytes[flag..flag + 4].copy_from_slice(&2_u32.to_be_bytes());
    assert!(serve(&mut Cursor::new(bytes), &mut Vec::new()).is_err());
    assert!(!first.exists());
}

#[cfg(unix)]
#[test]
fn preserves_inode_mode_hard_links_and_symbolic_link_targets() {
    use std::os::unix::{fs::MetadataExt, fs::PermissionsExt};

    let directory = Directory::new();
    let file = directory.0.join("file");
    let hard = directory.0.join("hard");
    let link = directory.0.join("link");
    fs::write(&file, b"long original contents").unwrap();
    fs::set_permissions(&file, fs::Permissions::from_mode(0o640)).unwrap();
    fs::hard_link(&file, &hard).unwrap();
    std::os::unix::fs::symlink(&file, &link).unwrap();
    let before = fs::metadata(&file).unwrap();
    let result = response(request(&[(&link, true, b"short")]));
    assert_eq!(result["completed"], 1);
    let after = fs::metadata(&file).unwrap();
    assert_eq!(before.ino(), after.ino());
    assert_eq!(before.mode(), after.mode());
    assert_eq!(fs::read(hard).unwrap(), b"short");
    assert!(fs::symlink_metadata(link).unwrap().is_symlink());
}

#[test]
fn rejects_excessive_counts_paths_and_payloads_before_allocating_or_writing() {
    let directory = Directory::new();
    let file = directory.0.join("file");
    for count in [0_u32, 65, u32::MAX] {
        let mut bytes = 1_u32.to_be_bytes().to_vec();
        bytes.extend_from_slice(&count.to_be_bytes());
        assert!(serve(&mut Cursor::new(bytes), &mut Vec::new()).is_err());
    }
    let mut bytes = request(&[(&file, true, b"a")]);
    bytes[8..12].copy_from_slice(&32_769_u32.to_be_bytes());
    assert!(serve(&mut Cursor::new(bytes), &mut Vec::new()).is_err());
    let mut bytes = request(&[(&file, true, b"a")]);
    let length = 16 + file.to_str().unwrap().len();
    bytes[length..length + 4].copy_from_slice(&(33 * 1024 * 1024_u32).to_be_bytes());
    assert!(serve(&mut Cursor::new(bytes), &mut Vec::new()).is_err());
    assert!(!file.exists());
}
