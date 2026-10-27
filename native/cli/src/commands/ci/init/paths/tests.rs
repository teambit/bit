//! Compare ordinary names, relative links, and lexical parent resolution with Node's filesystem API.
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[test]
fn filesystem_resolution_matches_node_without_expanding_ordinary_names() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    for name in ["actual/inner", "actual/leaf", "outer/leaf"] {
        fs::create_dir_all(root.join(name)).unwrap();
    }
    link(Path::new("../actual/inner"), &root.join("outer/alias"));
    link(Path::new("actual"), &root.join("alias"));
    link(Path::new("absent"), &root.join("dangling"));
    link(Path::new("loop"), &root.join("loop"));
    let paths: Vec<_> = [
        "",
        "actual/inner",
        "alias/inner",
        "outer/alias",
        "outer/alias/../leaf",
        "dangling",
        "loop",
        "missing/../other",
    ]
    .into_iter()
    .map(|name| root.join(name))
    .collect();
    let expected =
        reference(&paths, "const fs=require('node:fs'); p=>fs.existsSync(p)?fs.realpathSync(p):p");
    let actual: Vec<_> = paths
        .iter()
        .map(|path| super::real(path).unwrap())
        .collect();
    assert_eq!(actual, expected);
}
fn reference(paths: &[PathBuf], expression: &str) -> Vec<PathBuf> {
    let (setup, mapping) = expression.rsplit_once(';').unwrap();
    let script = format!(
        "{setup};process.stdout.write(JSON.stringify(JSON.parse(process.argv[1]).map({mapping})))",
    );
    let result = Command::new("node")
        .args(["-e", &script, &serde_json::to_string(paths).unwrap()])
        .output()
        .unwrap();
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
    serde_json::from_slice(&result.stdout).unwrap()
}
#[cfg(unix)]
fn link(target: &Path, path: &Path) {
    std::os::unix::fs::symlink(target, path).unwrap();
}
#[cfg(windows)]
fn link(target: &Path, path: &Path) {
    std::os::windows::fs::symlink_dir(target, path).unwrap();
}

#[cfg(windows)]
#[test]
fn relative_paths_preserve_alias_distinctions_but_ignore_windows_case() {
    let paths: Vec<PathBuf> = [
        r"C:\accounts\LONG-DIRECTORY\repo\child",
        r"C:\accounts\SHORT~1\repo\child",
        r"D:\repo\child",
        r"c:\accounts\long-directory\REPO",
    ]
    .into_iter()
    .map(PathBuf::from)
    .collect();
    let root = Path::new(r"C:\accounts\long-directory\repo");
    let actual: Vec<_> = paths
        .iter()
        .map(|path| super::super::git::relative(root, path))
        .collect();
    let expected = reference(
        &paths,
        r"const path=require('node:path'); p=>path.relative('C:\\accounts\\long-directory\\repo',p)",
    );
    assert_eq!(actual, expected);
}
