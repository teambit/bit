use super::serve;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{
    fs,
    io::{Cursor, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-workspace-engine-λ-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn write(&self, path: &str, bytes: &[u8]) -> PathBuf {
        let path = self.0.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, bytes).unwrap();
        path
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn frame(value: &Value) -> Vec<u8> {
    let body = serde_json::to_vec(value).unwrap();
    let mut bytes = 5_u32.to_be_bytes().to_vec();
    bytes.extend_from_slice(&(body.len() as u32).to_be_bytes());
    bytes.extend_from_slice(&body);
    bytes
}
fn response(value: &Value) -> Value {
    let mut output = Vec::new();
    serve(&mut Cursor::new(frame(value)), &mut output).unwrap();
    serde_json::from_slice(&output).unwrap()
}
fn source(directory: &Directory, body: &[u8]) -> Value {
    let hash = super::hash(body);
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "Source {hash} {}\0", body.len()).unwrap();
    encoder.write_all(body).unwrap();
    directory.write(&format!("{}/{}", &hash[..2], &hash[2..]), &encoder.finish().unwrap());
    json!({"kind":"source","objectsDirectory":directory.0,"hash":hash})
}
fn workspace(path: &Path, bytes: &[u8]) -> Value {
    json!({"kind":"workspace","path":path,"hash":super::hash(bytes)})
}
#[test]
fn scans_dotfiles_hard_exclusions_literal_nested_components_and_bitmap_policy() {
    let directory = Directory::new();
    for name in [
        "z.ts",
        "a.ts",
        ".bitmap",
        ".git",
        ".bit.map.json",
        ".hidden",
        "nested/.bitmap",
        "nested/.git",
        "nested/.bit.map.json",
        "nested/file",
        "node_modules/file",
        "nested/node_modules/file",
        ".bit/file",
        ".bitTmp/file",
        "app/[slug]/file",
        "app/l/file",
    ] {
        directory.write(name, b"x");
    }
    let root = response(
        &json!({"kind":"scan","root":directory.0,"excludeDirs":[directory.0.join("app/[slug]")],"workspaceRoot":true}),
    );
    assert_eq!(root["failed"], false);
    let names: Vec<_> = root["data"]["paths"]
        .as_array()
        .unwrap()
        .iter()
        .map(|path| {
            Path::new(path.as_str().unwrap())
                .strip_prefix(&directory.0)
                .unwrap()
                .to_str()
                .unwrap()
                .replace('\\', "/")
        })
        .collect();
    assert_eq!(names, vec![".bitmap", ".hidden", "a.ts", "app/l/file", "nested/file", "z.ts"]);
    let component =
        response(&json!({"kind":"scan","root":directory.0,"excludeDirs":[],"workspaceRoot":false}));
    let paths = component["data"]["paths"].as_array().unwrap();
    // Windows enumeration uses backslashes while joined relative inputs may contain slashes.
    let contains = |relative: &str| {
        paths
            .iter()
            .any(|value| Path::new(value.as_str().unwrap()) == directory.0.join(relative))
    };
    assert!(!contains(".bitmap"));
    assert!(contains("nested/.bitmap"));
}
#[test]
fn scan_and_read_fail_whole_batches_on_missing_paths_or_excessive_counts() {
    let directory = Directory::new();
    let first = directory.write("first", b"read");
    let result = response(&json!({"kind":"read","files":[first,directory.0.join("missing")]}));
    assert_eq!(result["failed"], true);
    assert_eq!(result["completed"], 0);
    assert!(result.get("data").is_none());
    assert_eq!(
        response(&json!({"kind":"scan","root":first,"excludeDirs":[],"workspaceRoot":false}))["failed"],
        true,
    );
    assert_eq!(response(&json!({"kind":"read","files":vec![first;4097]}))["failed"], true);
}
#[test]
fn reads_raw_disk_hash_stripped_bom_contents_and_linux_identity() {
    let directory = Directory::new();
    let raw = b"\xef\xbb\xbfa\r\nb\rc\n";
    let path = directory.write("file", raw);
    let result = response(&json!({"kind":"read","files":[path]}));
    let file = &result["data"]["files"][0];
    assert_eq!(file["hash"], super::hash(raw));
    assert_eq!(file["contents"], crate::validate::hexadecimal(b"a\r\nb\rc\n"));
    assert_eq!(file["linuxHash"], super::hash(b"a\nb\nc\n"));
    for (index, raw) in [
        b"\xef\xbb\xbf".as_slice(),
        b"\xff\xfe\r\n",
        b"\xfe\xff\r\n",
        b"\0\0\xfe\xff\r\n",
        b"\xff\xfe\0\0\r\n",
        b"\0\r\n",
        b"",
    ]
    .iter()
    .enumerate()
    {
        let path = directory.write(&format!("bom-{index}"), raw);
        let result = response(&json!({"kind":"read","files":[path]}));
        let bytes = if index == 0 { b"".as_slice() } else { *raw };
        assert_eq!(result["data"]["files"][0]["contents"], crate::validate::hexadecimal(bytes));
        assert_eq!(result["data"]["files"][0]["hash"], super::hash(raw));
    }
}
#[test]
fn refuses_files_beyond_raw_byte_budget_before_reading() {
    let directory = Directory::new();
    let path = directory.write("large", b"");
    fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .unwrap()
        .set_len((super::MAX_RAW + 1) as u64)
        .unwrap();
    assert_eq!(response(&json!({"kind":"read","files":[path]}))["failed"], true);
}
#[test]
fn compares_canonical_identity_strings_without_reordering_json() {
    assert_eq!(
        response(&json!({"kind":"compare","left":r#"{"a":1}"#,"right":r#"{"a":1}"#}))["data"]["modified"],
        false,
    );
    assert_eq!(
        response(&json!({"kind":"compare","left":r#"{"a":1,"b":2}"#,"right":r#"{"b":2,"a":1}"#}))["data"]
            ["modified"],
        true,
    );
}
#[test]
fn diff_skips_git_for_linux_equal_files_and_validates_workspace_snapshots() {
    let directory = Directory::new();
    let path = directory.write("file", b"a\r\n");
    let left = source(&directory, b"a\n");
    let right = workspace(&path, b"a\r\n");
    let result = response(
        &json!({"kind":"diff","files":[{"relativePath":"file","left":left,"right":right}],"gitExecutable":"missing-git-should-not-run","color":false}),
    );
    let file = &result["data"]["files"][0];
    assert_eq!(file["same"], true);
    assert_eq!(file["rawDiff"], "");
    assert_eq!(file["fromContent"], "a\n");
    assert_eq!(file["toContent"], "a\r\n");
    fs::write(&path, b"changed").unwrap();
    assert_eq!(
        response(
            &json!({"kind":"diff","files":[{"relativePath":"file","left":left,"right":right}],"gitExecutable":"missing-git-should-not-run","color":false})
        )["failed"],
        true,
    );
}
#[test]
fn diff_preserves_source_boms_and_strips_workspace_boms() {
    let directory = Directory::new();
    let raw = b"\xef\xbb\xbfa\n";
    let path = directory.write("file", raw);
    let result = response(
        &json!({"kind":"diff","files":[{"relativePath":"file","left":source(&directory,raw),"right":workspace(&path,raw)}],"gitExecutable":"git","color":false}),
    );
    let file = &result["data"]["files"][0];
    assert_eq!(result["failed"], false);
    assert_eq!(file["same"], false);
    assert_eq!(file["fromContent"], "\u{feff}a\n");
    assert_eq!(file["toContent"], "a\n");
    assert!(
        file["rawDiff"]
            .as_str()
            .unwrap()
            .contains("--- "),
    );
}
#[test]
fn diff_handles_changes_added_deleted_empty_and_binary_files_in_order() {
    let directory = Directory::new();
    let before_source = source(&directory, b"before\n");
    let after_source = source(&directory, b"after\n");
    let empty = source(&directory, b"");
    let binary_a = source(&directory, b"\0a");
    let binary_b = source(&directory, b"\0b");
    let result = response(
        &json!({"kind":"diff","files":[{"relativePath":"changed","left":before_source,"right":after_source},{"relativePath":"new","right":after_source},{"relativePath":"deleted","left":before_source},{"relativePath":"empty","right":empty},{"relativePath":"binary","left":binary_a,"right":binary_b}],"gitExecutable":"git","color":false}),
    );
    assert_eq!(result["failed"], false);
    assert_eq!(result["completed"], 5);
    let files = result["data"]["files"].as_array().unwrap();
    assert!(
        files[0]["rawDiff"]
            .as_str()
            .unwrap()
            .contains("-before\n+after\n"),
    );
    assert_eq!(files[1]["fromContent"], "");
    assert_eq!(files[2]["toContent"], "");
    assert_eq!(files[3]["same"], false);
    assert_eq!(files[3]["rawDiff"], "");
    assert!(
        files[4]["rawDiff"]
            .as_str()
            .unwrap()
            .contains("Binary files"),
    );
}
#[test]
fn missing_git_and_corrupt_sources_decline_without_partial_results() {
    let directory = Directory::new();
    let input = source(&directory, b"contents\n");
    let request = json!({"kind":"diff","files":[{"relativePath":"new","right":input}],"gitExecutable":"missing-git-executable","color":false});
    assert_eq!(response(&request)["failed"], true);
    let hash = input["hash"].as_str().unwrap();
    directory.write(&format!("{}/{}", &hash[..2], &hash[2..]), b"corrupt");
    assert_eq!(response(&request)["failed"], true);
}
#[test]
fn malformed_or_partial_frames_never_emit_partial_output() {
    let bytes = frame(&json!({"kind":"compare","left":"a","right":"b"}));
    for length in 0..bytes.len() {
        let mut output = Vec::new();
        assert!(serve(&mut Cursor::new(&bytes[..length]), &mut output).is_err());
        assert!(output.is_empty());
    }
    assert_eq!(response(&json!({"kind":"unknown"}))["failed"], true);
    assert_eq!(response(&json!({"kind":"read","files":["relative"]}))["failed"], true);
}
#[cfg(unix)]
#[test]
fn scan_and_read_decline_symlinks_without_following_them() {
    let directory = Directory::new();
    let file = directory.write("file", b"x");
    let link = directory.0.join("link");
    std::os::unix::fs::symlink(&file, &link).unwrap();
    assert_eq!(
        response(&json!({"kind":"scan","root":directory.0,"excludeDirs":[],"workspaceRoot":true}))
            ["failed"],
        true,
    );
    assert_eq!(response(&json!({"kind":"read","files":[link]}))["failed"], true);
    assert_eq!(fs::read(file).unwrap(), b"x");
}
#[cfg(unix)]
#[test]
fn failed_git_runs_reap_processes_and_remove_temporary_directories() {
    use std::os::unix::fs::PermissionsExt;
    let directory = Directory::new();
    let log = directory.0.join("log");
    let script = directory.write(
        "git",
        format!("#!/bin/sh\nprintf '%s' \"$3\" > '{}'\nexit 2\n", log.display()).as_bytes(),
    );
    fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
    let result = response(
        &json!({"kind":"diff","files":[{"relativePath":"new","right":source(&directory,b"text")}],"gitExecutable":script,"color":false}),
    );
    assert_eq!(result["failed"], true);
    let temp = fs::read_to_string(log).unwrap();
    assert!(
        !Path::new(&temp)
            .parent()
            .unwrap()
            .exists(),
    );
}

#[test]
fn scan_matches_javascript_utf16_sort_order_for_unicode_paths() {
    let directory = Directory::new();
    let astral = directory.write("𐀀", b"x");
    let private = directory.write("\u{e000}", b"x");
    let result =
        response(&json!({"kind":"scan","root":directory.0,"excludeDirs":[],"workspaceRoot":true}));
    assert_eq!(result["data"]["paths"], json!([astral, private]));
}
#[test]
fn oversized_diff_json_returns_failure_without_partial_data() {
    let directory = Directory::new();
    let bytes = vec![0; 4 * 1024 * 1024];
    let file = directory.write("binary", &bytes);
    let input = workspace(&file, &bytes);
    let result = response(
        &json!({"kind":"diff","files":[{"relativePath":"binary","left":input,"right":input}],"gitExecutable":"missing-git-never-needed","color":false}),
    );
    assert_eq!(result["failed"], true);
    assert_eq!(result["completed"], 0);
    assert!(result.get("data").is_none());
}
#[test]
fn diff_respects_requested_git_color_and_keeps_final_newline_for_node_formatter() {
    let directory = Directory::new();
    let result = response(
        &json!({"kind":"diff","files":[{"relativePath":"new","right":source(&directory,b"new\n")}],"gitExecutable":"git","color":true}),
    );
    assert_eq!(result["failed"], false);
    let raw = result["data"]["files"][0]["rawDiff"].as_str().unwrap();
    assert!(raw.contains("\u{1b}["));
    assert!(raw.ends_with('\n'));
}
