use super::serve;
use crate::workspace::tests::Directory;
use serde_json::Value;
use std::{fs, io::Cursor, path::Path};

fn frame(actions: &[(u32, &Path, Option<&Path>)]) -> Vec<u8> {
    let mut bytes = 31_u32.to_be_bytes().to_vec();
    bytes.extend_from_slice(&(actions.len() as u32).to_be_bytes());
    for (kind, source, destination) in actions {
        bytes.extend_from_slice(&kind.to_be_bytes());
        for path in [Some(*source), *destination] {
            let name = path
                .map_or("", |path| path.to_str().unwrap())
                .as_bytes();
            bytes.extend_from_slice(&(name.len() as u32).to_be_bytes());
            bytes.extend_from_slice(name);
        }
    }
    bytes
}
fn response(bytes: Vec<u8>) -> Value {
    let mut output = Vec::new();
    serve(&mut Cursor::new(bytes), &mut output).unwrap();
    serde_json::from_slice(&output).unwrap()
}
#[test]
fn removes_nested_trees_and_ignores_missing_paths() {
    let directory = Directory::new();
    let nested = directory.0.join("nested");
    fs::create_dir_all(nested.join("child")).unwrap();
    fs::write(nested.join("child/file"), b"x").unwrap();
    assert_eq!(response(frame(&[(0, &nested, None), (0, &nested, None)]))["completed"], 2);
    assert!(!nested.exists());
}
#[test]
fn preserves_nonempty_directories_and_stops_at_nondirectory() {
    let directory = Directory::new();
    let file = directory.0.join("file");
    fs::write(&file, b"x").unwrap();
    let result = response(frame(&[(1, &directory.0, None), (1, &file, None), (0, &file, None)]));
    assert_eq!(result["completed"], 1);
    assert_eq!(result["failed"], true);
    assert!(file.exists());
}
#[test]
fn incomplete_or_invalid_frames_never_remove_prefixes() {
    let directory = Directory::new();
    let file = directory.0.join("file");
    fs::write(&file, b"x").unwrap();
    let bytes = frame(&[(0, &file, None), (1, &directory.0, None)]);
    for length in 0..bytes.len() {
        assert!(serve(&mut Cursor::new(&bytes[..length]), &mut Vec::new()).is_err());
        assert!(file.exists());
    }
    for actions in
        [vec![(0, &file as &Path, None), (4, &file, None)], vec![(0, &file, Some(file.as_path()))]]
    {
        assert!(serve(&mut Cursor::new(frame(&actions)), &mut Vec::new()).is_err());
        assert!(file.exists());
    }
}
#[cfg(unix)]
#[test]
fn removes_dangling_links_and_never_follows_directory_links() {
    let directory = Directory::new();
    let target = directory.0.join("target");
    let link = directory.0.join("link");
    fs::create_dir(&target).unwrap();
    fs::write(target.join("file"), b"x").unwrap();
    std::os::unix::fs::symlink(&target, &link).unwrap();
    assert_eq!(response(frame(&[(0, &link, None)]))["completed"], 1);
    assert!(target.join("file").exists());
    std::os::unix::fs::symlink(directory.0.join("missing"), &link).unwrap();
    assert_eq!(response(frame(&[(0, &link, None)]))["completed"], 1);
    assert!(fs::symlink_metadata(link).is_err());
}
#[cfg(unix)]
#[test]
fn links_files_directories_and_explicit_symbolic_links() {
    use std::os::unix::fs::MetadataExt;
    let directory = Directory::new();
    let source = directory.0.join("source");
    let hard = directory.0.join("nested/hard");
    let symbolic = directory.0.join("symbolic");
    let linked_dir = directory.0.join("linked-dir");
    fs::write(&source, b"x").unwrap();
    let result = response(frame(&[
        (2, &source, Some(&hard)),
        (3, &source, Some(&symbolic)),
        (2, &directory.0, Some(&linked_dir)),
    ]));
    assert_eq!(result["completed"], 3);
    assert_eq!(fs::metadata(&source).unwrap().ino(), fs::metadata(hard).unwrap().ino());
    assert_eq!(fs::read_link(symbolic).unwrap(), source);
    assert_eq!(fs::read_link(linked_dir).unwrap(), directory.0);
}

#[test]
fn removes_directories_containing_only_system_files() {
    let directory = Directory::new();
    let target = directory.0.join("empty");
    fs::create_dir(&target).unwrap();
    fs::write(target.join(".DS_Store"), b"metadata").unwrap();
    assert_eq!(response(frame(&[(1, &target, None)]))["completed"], 1);
    assert!(!target.exists());
}
#[cfg(windows)]
#[test]
fn windows_links_regular_files_and_preserves_unsupported_destinations() {
    let directory = Directory::new();
    let source = directory.0.join("source");
    let destination = directory.0.join("destination");
    fs::write(&source, b"source").unwrap();
    assert_eq!(response(frame(&[(2, &source, Some(&destination))]))["completed"], 1);
    fs::write(&source, b"updated").unwrap();
    assert_eq!(fs::read(&destination).unwrap(), b"updated");
    let result = response(frame(&[(3, &source, Some(&destination))]));
    assert_eq!(result["completed"], 0);
    assert_eq!(result["failed"], true);
    assert_eq!(fs::read(destination).unwrap(), b"updated");
}

#[test]
fn rejects_invalid_paths_counts_and_path_lengths_before_mutation() {
    let directory = Directory::new();
    let file = directory.0.join("file");
    fs::write(&file, b"x").unwrap();
    for count in [0_u32, 65, u32::MAX] {
        let mut bytes = 31_u32.to_be_bytes().to_vec();
        bytes.extend_from_slice(&count.to_be_bytes());
        assert!(serve(&mut Cursor::new(bytes), &mut Vec::new()).is_err());
    }
    let relative = Path::new("relative");
    assert!(
        serve(&mut Cursor::new(frame(&[(0, &file, None), (0, relative, None)])), &mut Vec::new())
            .is_err(),
    );
    let mut bytes = frame(&[(0, &file, None)]);
    bytes[12..16].copy_from_slice(&32_769_u32.to_be_bytes());
    assert!(serve(&mut Cursor::new(bytes), &mut Vec::new()).is_err());
    let mut bytes = frame(&[(0, &file, None)]);
    bytes[16] = 0;
    assert!(serve(&mut Cursor::new(bytes), &mut Vec::new()).is_err());
    let mut bytes = frame(&[(0, &file, None)]);
    bytes[16] = 255;
    assert!(serve(&mut Cursor::new(bytes), &mut Vec::new()).is_err());
    assert!(file.exists());
}
