//! A tracked authored component survives a lost local scope and a normal import installation.
use super::{FOO_FIXTURE, Helper, OsStr, fs, setup, without_progress_timing};
use flate2::read::ZlibDecoder;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Read,
    path::Path,
};

#[test]
fn authored_paths_and_installation_match_released_node_after_reinitialization() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    let bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    helper.re_init_workspace();
    helper.add_remote_scope();
    fs::write(helper.scopes.local_path.join(".bitmap"), bitmap).unwrap();
    if let Some(destination) = std::env::var_os("BIT_NATIVE_IMPORT_AUTHORED_INSTALL_FIXTURE") {
        let destination = std::path::PathBuf::from(destination);
        assert!(!destination.exists());
        fs::create_dir_all(&destination).unwrap();
        setup::copy_dir(&helper.scopes.local_path, &destination.join("workspace"));
        setup::copy_dir(&helper.scopes.remote_path, &destination.join("remote"));
    }
    let node_root = helper.clone_workspace();
    let command = format!("import {}/bar/foo", helper.scopes.remote);
    let node = Helper::cmd_in_with(
        &node_root,
        &command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    let native =
        Helper::cmd_in_with(&helper.scopes.local_path, &command, &[("CI", OsStr::new("1"))]);
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    if without_progress_timing(&native.stdout) != without_progress_timing(&node.stdout) {
        eprintln!(
            "native authored import paths: {}",
            path_state(&helper.scopes.local_path, &helper.scopes.remote),
        );
        eprintln!("Node authored import paths: {}", path_state(&node_root, &helper.scopes.remote));
    }
    assert_eq!(without_progress_timing(&native.stdout), without_progress_timing(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    let actual = &helper.scopes.local_path;
    assert_eq!(tree(actual), tree(&node_root));
    for (metadata, directory, prefix) in [
        (".bit/bitmap-history-metadata.txt", ".bit/bitmap-history", ".bitmap-"),
        (".bit/workspace-config-history/metadata.txt", ".bit/workspace-config-history/files", ""),
    ] {
        assert_eq!(
            history(actual, metadata, directory, prefix),
            history(&node_root, metadata, directory, prefix),
        );
    }
    assert_eq!(
        fs::read(actual.join("bar/foo.js")).unwrap(),
        fs::read(node_root.join("bar/foo.js")).unwrap(),
    );
    assert!(!actual.join("node_modules/undefined").exists());
}

pub(super) fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut entries = BTreeMap::new();
    visit(root, root, &mut entries);
    entries
}

pub(super) fn assert_same_tree(actual: &Path, expected: &Path) {
    let actual = tree(actual);
    let expected = tree(expected);
    assert_tree_maps(&actual, &expected);
}

pub(super) fn assert_tree_maps(
    actual: &BTreeMap<String, Vec<u8>>,
    expected: &BTreeMap<String, Vec<u8>>,
) {
    for key in actual.keys().chain(expected.keys()) {
        assert!(
            actual.get(key) == expected.get(key),
            "workspace path {key} differs: native {}, Node {}",
            preview(actual.get(key)),
            preview(expected.get(key)),
        );
    }
}

fn path_state(root: &Path, scope: &str) -> String {
    let bitmap = crate::helper::config::read_jsonc(&root.join(".bitmap"));
    let mut rows = bitmap
        .as_object()
        .into_iter()
        .flat_map(|rows| rows.iter())
        .filter_map(|(id, row)| {
            row["rootDir"]
                .as_str()
                .map(|directory| {
                    format!(
                        "{id}:scope={}:default={}:dir={directory}",
                        row["scope"], row["defaultScope"],
                    )
                })
        })
        .take(8)
        .collect::<Vec<_>>();
    rows.sort();
    let scoped = format!("{scope}/bar/foo");
    let paths = ["bar", "bar/foo.js", scoped.as_str()];
    let files = paths.map(|path| {
        let absolute = root.join(path);
        format!(
            "{path}={}",
            if absolute.is_dir() {
                "dir"
            } else if absolute.is_file() {
                "file"
            } else {
                "absent"
            },
        )
    });
    format!("bitmap={rows:?}; {}", files.join(", "))
}

fn preview(value: Option<&Vec<u8>>) -> String {
    match value {
        None => "absent".to_owned(),
        Some(bytes) => format!("{} bytes {:?}", bytes.len(), &bytes[..bytes.len().min(96)]),
    }
}

fn visit(root: &Path, dir: &Path, entries: &mut BTreeMap<String, Vec<u8>>) {
    for entry in fs::read_dir(dir).unwrap().map(Result::unwrap) {
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if relative.starts_with(".bit/bitmap-history")
            || relative.starts_with(".bit/workspace-config-history")
        {
            continue;
        }
        let metadata = fs::symlink_metadata(&path).unwrap();
        let kind = metadata.file_type();
        let bytes = entry_bytes(root, &path, &relative, kind);
        let mode = mode(&metadata);
        assert!(
            entries
                .insert(format!("{relative}:mode"), mode)
                .is_none(),
        );
        assert!(entries.insert(relative, bytes).is_none());
        if kind.is_dir() {
            visit(root, &path, entries);
        }
    }
}

fn entry_bytes(root: &Path, path: &Path, relative: &str, kind: fs::FileType) -> Vec<u8> {
    if kind.is_symlink() {
        let target = fs::read_link(path).unwrap();
        let target = target
            .strip_prefix(root)
            .map_or_else(
                |_| target.to_string_lossy().into_owned(),
                |relative| format!("<WORKSPACE>/{}", relative.display()),
            );
        return format!("symlink:{target}").into_bytes();
    }
    if kind.is_dir() {
        return b"directory".to_vec();
    }
    if relative == ".bit/command-history" || relative == "command-history" {
        return normalized_command_history(&fs::read(path).unwrap());
    }
    if relative.starts_with(".bit/objects/") {
        let mut inflated = Vec::new();
        ZlibDecoder::new(fs::File::open(path).unwrap()).read_to_end(&mut inflated).unwrap();
        return inflated;
    }
    fs::read(path).unwrap()
}

fn normalized_command_history(raw: &[u8]) -> Vec<u8> {
    let text = std::str::from_utf8(raw).expect("command history must be UTF-8");
    assert!(text.is_empty() || text.ends_with('\n'), "command history final newline");
    let mut result = String::new();
    for line in text.lines() {
        let (stamp, tail) = line.split_once(' ').expect("command history timestamp");
        let (pid, event) = tail.split_once(' ').expect("command history process ID");
        valid_history_stamp(stamp);
        assert!(
            pid.parse::<u32>()
                .is_ok_and(|pid| pid > 0),
            "command history PID: {pid}",
        );
        assert!(
            event.ends_with(", started")
                || event.ends_with(", succeeded")
                || event.ends_with(", failed"),
            "command history event: {event}",
        );
        result.push_str("<TIME> <PID> ");
        result.push_str(event);
        result.push('\n');
    }
    result.into_bytes()
}

fn valid_history_stamp(stamp: &str) {
    let bytes = stamp.as_bytes();
    assert_eq!(bytes.len(), 24, "command history timestamp: {stamp}");
    for (position, value) in
        [(4, b'-'), (7, b'-'), (10, b'T'), (13, b':'), (16, b':'), (19, b'.'), (23, b'Z')]
    {
        assert_eq!(bytes[position], value, "command history timestamp: {stamp}");
    }
    assert!(
        bytes
            .iter()
            .enumerate()
            .all(|(position, byte)| {
                [4, 7, 10, 13, 16, 19, 23].contains(&position) || byte.is_ascii_digit()
            }),
        "command history timestamp: {stamp}",
    );
    let number = |start, end| stamp[start..end].parse::<u32>().unwrap();
    assert!(number(0, 4) >= 1970 && (1..=12).contains(&number(5, 7)));
    assert!((1..=31).contains(&number(8, 10)) && number(11, 13) < 24);
    assert!(number(14, 16) < 60 && number(17, 19) < 60);
}

#[cfg(unix)]
fn mode(metadata: &fs::Metadata) -> Vec<u8> {
    use std::os::unix::fs::PermissionsExt;
    (metadata.permissions().mode() & 0o7777).to_le_bytes().to_vec()
}

#[cfg(not(unix))]
fn mode(metadata: &fs::Metadata) -> Vec<u8> {
    vec![u8::from(metadata.permissions().readonly())]
}

#[derive(Debug, PartialEq, Eq)]
pub(super) struct History {
    directory: Option<(bool, Vec<u8>)>,
    rows: Vec<(String, Vec<u8>)>,
}

pub(super) fn history(root: &Path, metadata: &str, directory: &str, prefix: &str) -> History {
    let directory = root.join(directory);
    let directory_state = match fs::symlink_metadata(&directory) {
        Ok(metadata) => Some((metadata.is_dir(), mode(&metadata))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => panic!("history directory {}: {error}", directory.display()),
    };
    let lines = match fs::read_to_string(root.join(metadata)) {
        Ok(lines) => Some(lines),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => panic!("history metadata {metadata}: {error}"),
    };
    let Some(lines) = lines else {
        if directory_state.is_some() {
            let entries = fs::read_dir(&directory)
                .unwrap()
                .map(|entry| entry.unwrap().file_name())
                .collect::<Vec<_>>();
            assert!(
                entries.is_empty(),
                "history without metadata at {}: {entries:?}",
                directory.display(),
            );
        }
        return History { directory: directory_state, rows: Vec::new() };
    };
    let mut ids = BTreeSet::new();
    let rows = lines
        .lines()
        .map(|line| {
            let (id, reason) = line.split_once(' ').unwrap();
            ids.insert(id.to_owned());
            let backup = directory.join(format!("{prefix}{id}"));
            (reason.to_owned(), fs::read(backup).unwrap())
        })
        .collect::<Vec<_>>();
    assert_eq!(fs::read_dir(&directory).unwrap().count(), ids.len());
    History { directory: directory_state, rows }
}
