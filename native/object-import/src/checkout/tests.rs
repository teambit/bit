mod cached;
mod source_reads;

use super::{repository, serve};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{Cursor, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

fn pool() -> &'static rayon::ThreadPool {
    static POOL: std::sync::LazyLock<rayon::ThreadPool> = std::sync::LazyLock::new(|| {
        rayon::ThreadPoolBuilder::new()
            .num_threads(4)
            .build()
            .unwrap()
    });
    &POOL
}
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("bit-checkout-{}-{id}", std::process::id()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn compressed(body: &[u8], kind: &str, header_hash: [u8; 20], size: usize) -> Vec<u8> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {} {size}\0", crate::validate::hexadecimal(&header_hash)).unwrap();
    encoder.write_all(body).unwrap();
    encoder.finish().unwrap()
}
fn store(directory: &Path, body: &[u8]) -> [u8; 20] {
    let hash: [u8; 20] = Sha1::digest(body).into();
    store_raw(directory, hash, &compressed(body, "Source", hash, body.len()));
    hash
}
fn store_raw(directory: &Path, hash: [u8; 20], contents: &[u8]) {
    let identity = crate::validate::hexadecimal(&hash);
    fs::create_dir_all(directory.join(&identity[..2])).unwrap();
    fs::write(
        directory
            .join(&identity[..2])
            .join(&identity[2..]),
        contents,
    )
    .unwrap();
}
fn frame(directory: &Path, files: &[([u8; 20], &Path, u32, u32)]) -> Vec<u8> {
    let mut bytes = 9_u32.to_be_bytes().to_vec();
    bytes.extend_from_slice(&(files.len() as u32).to_be_bytes());
    append_path(&mut bytes, directory);
    for (hash, path, overwrite, eol) in files {
        bytes.extend_from_slice(hash);
        append_path(&mut bytes, path);
        bytes.extend_from_slice(&overwrite.to_be_bytes());
        bytes.extend_from_slice(&eol.to_be_bytes());
    }
    bytes
}
fn append_path(bytes: &mut Vec<u8>, path: &Path) {
    let name = path.to_str().unwrap().as_bytes();
    bytes.extend_from_slice(&(name.len() as u32).to_be_bytes());
    bytes.extend_from_slice(name);
}
fn response(bytes: Vec<u8>, preflight: bool) -> Value {
    let mut output = Vec::new();
    serve(
        &mut Cursor::new(bytes),
        &mut output,
        preflight,
        &mut super::cache::State::default(),
        pool(),
    )
    .unwrap();
    serde_json::from_slice(&output).unwrap()
}
#[test]
fn preflight_validates_sources_without_creating_workspace_directories() {
    let directory = Directory::new();
    let hash = store(&directory.0, b"source\r\n");
    let target = directory.0.join("workspace/file");
    let result = response(frame(&directory.0, &[(hash, &target, 1, 1)]), true);
    assert_eq!(result["completed"], 1);
    assert_eq!(result["failed"], false);
    assert!(!target.parent().unwrap().exists());
}
#[test]
fn materializes_nested_empty_binary_and_text_sources_directly() {
    let directory = Directory::new();
    let files =
        [(b"".as_slice(), "empty"), (b"\0\xff\r\n", "binary"), (b"hello\r\nworld\r", "text")];
    let paths: Vec<_> = files
        .iter()
        .map(|(_, name)| directory.0.join(format!("workspace/{name}")))
        .collect();
    let inputs: Vec<_> = files
        .iter()
        .zip(&paths)
        .map(|((body, _), path)| (store(&directory.0, body), path.as_path(), 1, 1))
        .collect();
    assert_eq!(response(frame(&directory.0, &inputs), false)["completed"], 3);
    assert_eq!(fs::read(&paths[0]).unwrap(), b"");
    assert_eq!(fs::read(&paths[1]).unwrap(), b"\0\xff\r\n");
    assert_eq!(
        fs::read(&paths[2]).unwrap(),
        if cfg!(windows) { b"hello\r\nworld\r\n".as_slice() } else { b"hello\nworld\n" },
    );
}
#[test]
fn invalid_later_source_never_writes_a_valid_prefix() {
    let directory = Directory::new();
    let hash = store(&directory.0, b"source");
    let first = directory.0.join("first");
    let last = directory.0.join("last");
    fs::write(&first, b"original").unwrap();
    for corrupt in [
        b"garbage".to_vec(),
        compressed(b"other", "Source", [7; 20], 5),
        compressed(b"source", "Version", [7; 20], 6),
    ] {
        store_raw(&directory.0, [7; 20], &corrupt);
        let result =
            response(frame(&directory.0, &[(hash, &first, 1, 0), ([7; 20], &last, 1, 0)]), false);
        assert_eq!(result["completed"], 0);
        assert_eq!(result["failed"], true);
        assert_eq!(fs::read(&first).unwrap(), b"original");
        assert!(!last.exists());
    }
}
#[test]
fn incomplete_or_invalid_frames_never_mutate_destinations() {
    let directory = Directory::new();
    let hash = store(&directory.0, b"source");
    let target = directory.0.join("target");
    let bytes = frame(&directory.0, &[(hash, &target, 1, 0)]);
    for length in 0..bytes.len() {
        assert!(
            serve(
                &mut Cursor::new(&bytes[..length]),
                &mut Vec::new(),
                false,
                &mut super::cache::State::default(),
                pool(),
            )
            .is_err(),
        );
        assert!(!target.exists());
    }
    for (path, overwrite, eol) in
        [(target.as_path(), 0, 0), (target.as_path(), 1, 2), (Path::new("relative"), 1, 0)]
    {
        assert!(
            serve(
                &mut Cursor::new(frame(&directory.0, &[(hash, path, overwrite, eol)])),
                &mut Vec::new(),
                false,
                &mut super::cache::State::default(),
                pool(),
            )
            .is_err(),
        );
        assert!(!target.exists());
    }
}
#[test]
fn stops_at_first_filesystem_failure_and_retains_acknowledged_prefix() {
    let directory = Directory::new();
    let hash = store(&directory.0, b"source");
    let first = directory.0.join("first");
    let last = directory.0.join("last");
    let result = response(
        frame(
            &directory.0,
            &[(hash, &first, 1, 0), (hash, &directory.0, 1, 0), (hash, &last, 1, 0)],
        ),
        false,
    );
    assert_eq!(result["completed"], 1);
    assert_eq!(result["failed"], true);
    assert_eq!(fs::read(first).unwrap(), b"source");
    assert!(!last.exists());
}
#[test]
fn checks_stream_termination_header_identity_and_actual_body_identity() {
    let directory = Directory::new();
    let body = b"source";
    let hash: [u8; 20] = Sha1::digest(body).into();
    let original = compressed(body, "Source", hash, 999);
    store_raw(&directory.0, hash, &original);
    assert_eq!(repository::source(&directory.0, hash, 1024, &mut 0).unwrap(), body);
    for corrupt in [
        original[..original.len() - 1].to_vec(),
        [original.as_slice(), b"trailing"].concat(),
        compressed(body, "Source", [3; 20], 6),
        compressed(b"other", "Source", hash, 5),
    ] {
        store_raw(&directory.0, hash, &corrupt);
        assert!(repository::source(&directory.0, hash, 1024, &mut 0).is_err());
    }
}
#[test]
fn respects_repository_and_inflated_byte_budgets() {
    let directory = Directory::new();
    let hash = store(&directory.0, b"123456789");
    assert!(repository::source(&directory.0, hash, 8, &mut 0).is_err());
    let mut consumed = super::MAX_BYTES;
    assert!(repository::source(&directory.0, hash, 1024, &mut consumed).is_err());
}
#[cfg(unix)]
#[test]
fn in_place_materialization_preserves_inode_modes_hard_links_and_symlink_targets() {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let directory = Directory::new();
    let hash = store(&directory.0, b"replacement");
    let file = directory.0.join("file");
    let link = directory.0.join("link");
    let hard = directory.0.join("hard");
    fs::write(&file, b"original").unwrap();
    fs::set_permissions(&file, fs::Permissions::from_mode(0o640)).unwrap();
    fs::hard_link(&file, &hard).unwrap();
    std::os::unix::fs::symlink(&file, &link).unwrap();
    let before = fs::metadata(&file).unwrap();
    assert_eq!(response(frame(&directory.0, &[(hash, &link, 1, 0)]), false)["completed"], 1);
    let after = fs::metadata(&file).unwrap();
    assert_eq!(after.ino(), before.ino());
    assert_eq!(after.mode(), before.mode());
    assert_eq!(fs::read(hard).unwrap(), b"replacement");
    assert_eq!(fs::read_link(link).unwrap(), file);
}

#[test]
fn writes_verified_snapshot_after_preflight_without_rereading_repository() {
    let directory = Directory::new();
    let hash = store(&directory.0, b"verified snapshot\r\n");
    let destination = directory.0.join("destination");
    let mut state = super::cache::State::default();
    let mut output = Vec::new();
    serve(
        &mut Cursor::new(frame(&directory.0, &[(hash, &destination, 1, 1)])),
        &mut output,
        true,
        &mut state,
        pool(),
    )
    .unwrap();
    let identity = crate::validate::hexadecimal(&hash);
    fs::remove_file(
        directory.0
            .join(&identity[..2])
            .join(&identity[2..]),
    )
    .unwrap();
    output.clear();
    serve(
        &mut Cursor::new(frame(&directory.0, &[(hash, &destination, 1, 1)])),
        &mut output,
        false,
        &mut state,
        pool(),
    )
    .unwrap();
    let result: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(result["completed"], 1);
    assert_eq!(fs::read(destination).unwrap(), super::eol::auto(b"verified snapshot\r\n".to_vec()));
}

#[test]
fn parallel_preflight_preserves_order_and_large_source_fallback() {
    let directory = Directory::new();
    let large = vec![b'x'; 9 * 1024 * 1024];
    let hash = store(&directory.0, &large);
    let small = store(&directory.0, b"small\r\n");
    let paths = (0..32)
        .map(|index| directory.0.join(format!("output/{index}")))
        .collect::<Vec<_>>();
    let inputs = paths
        .iter()
        .enumerate()
        .map(|(index, path)| (if index == 3 { hash } else { small }, path.as_path(), 1, 1))
        .collect::<Vec<_>>();
    let result = response(frame(&directory.0, &inputs), false);
    assert_eq!(result["completed"], 32);
    assert_eq!(result["failed"], false);
    for (index, path) in paths.iter().enumerate() {
        assert_eq!(
            fs::read(path).unwrap(),
            if index == 3 { large.clone() } else { super::eol::auto(b"small\r\n".to_vec()) },
        );
    }
}
#[test]
fn parallel_preflight_rejects_corrupt_tail_before_public_writes() {
    let directory = Directory::new();
    let hash = store(&directory.0, b"verified");
    store_raw(&directory.0, [7; 20], b"corrupt");
    let paths = (0..32)
        .map(|index| directory.0.join(format!("output/{index}")))
        .collect::<Vec<_>>();
    let inputs = paths
        .iter()
        .enumerate()
        .map(|(index, path)| (if index == 31 { [7; 20] } else { hash }, path.as_path(), 1, 1))
        .collect::<Vec<_>>();
    let result = response(frame(&directory.0, &inputs), false);
    assert_eq!(result["completed"], 0);
    assert_eq!(result["failed"], true);
    assert!(!directory.0.join("output").exists());
}
#[test]
fn parallel_preflight_enforces_aggregate_inflated_budget() {
    let directory = Directory::new();
    let hash = store(&directory.0, &vec![b'x'; 2 * 1024 * 1024]);
    let paths = (0..32)
        .map(|index| directory.0.join(format!("output/{index}")))
        .collect::<Vec<_>>();
    let inputs = paths
        .iter()
        .map(|path| (hash, path.as_path(), 1, 0))
        .collect::<Vec<_>>();
    let result = response(frame(&directory.0, &inputs), false);
    assert_eq!(result["completed"], 0);
    assert_eq!(result["failed"], true);
    assert!(!directory.0.join("output").exists());
}

#[test]
fn parallel_preflight_caches_every_ordered_raw_body_for_later_writes() {
    let directory = Directory::new();
    let bodies = (0..32)
        .map(|index| format!("file {index}\r\n").into_bytes())
        .collect::<Vec<_>>();
    let paths = (0..32)
        .map(|index| directory.0.join(format!("output/{index}")))
        .collect::<Vec<_>>();
    let inputs = bodies
        .iter()
        .zip(&paths)
        .map(|(body, path)| (store(&directory.0, body), path.as_path(), 1, 1))
        .collect::<Vec<_>>();
    let request = frame(&directory.0, &inputs);
    let mut state = super::cache::State::default();
    let mut output = Vec::new();
    serve(&mut Cursor::new(&request), &mut output, true, &mut state, pool()).unwrap();
    assert_eq!(serde_json::from_slice::<Value>(&output).unwrap()["completed"], 32);
    for (hash, _, _, _) in &inputs {
        let name = crate::validate::hexadecimal(hash);
        fs::remove_file(
            directory.0
                .join(&name[..2])
                .join(&name[2..]),
        )
        .unwrap();
    }
    output.clear();
    serve(&mut Cursor::new(&request), &mut output, false, &mut state, pool()).unwrap();
    assert_eq!(serde_json::from_slice::<Value>(&output).unwrap()["completed"], 32);
    for (body, path) in bodies.into_iter().zip(paths) {
        assert_eq!(fs::read(path).unwrap(), super::eol::auto(body));
    }
}
