//! Shared identity-operation oracle: same-path replay plus an untouched real remote.
use crate::{
    commands::add::support,
    helper::{Helper, Run, config},
};
use serde_json::Value;
use std::{collections::BTreeMap, fs, path::Path};

pub(crate) fn workspace(count: usize, tagged: bool) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    for index in 1..=count {
        helper.output_file(
            &format!("comp{index}/index.js"),
            &format!("module.exports=()=> 'comp{index}';\n"),
        );
        setup(&helper, &format!("add comp{index} -i comp{index}"));
    }
    if tagged {
        tag(&helper);
    }
    helper
}
pub(crate) fn setup(helper: &Helper, command: &str) -> String {
    let output = support::node(&helper.scopes.local_path, command);
    assert!(output.status.success(), "{command}: {} {}", output.stdout, output.stderr);
    output.stdout
}
pub(crate) fn compare(helper: &Helper, command: &str) -> Run {
    let remote = tree(&helper.scopes.remote_path);
    let actual = support::compare(helper, command);
    assert!(tree(&helper.scopes.remote_path) == remote, "{command} mutated the remote");
    actual
}
pub(crate) fn tag(helper: &Helper) {
    setup(helper, "tag --ignore-issues * --message identity-fixture");
}
pub(crate) fn json(helper: &Helper, command: &str) -> Value {
    serde_json::from_str(&setup(helper, command)).unwrap()
}
pub(crate) fn bitmap(helper: &Helper) -> Value {
    config::read_jsonc(&helper.scopes.local_path.join(".bitmap"))
}
pub(crate) fn show(helper: &Helper, id: &str, title: &str) -> Value {
    let value = json(helper, &format!("show {id} --json"));
    value
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["title"] == title)
        .unwrap()["json"]
        .clone()
}
pub(crate) fn aspect(helper: &Helper, id: &str, aspect: &str) -> Option<Value> {
    show(helper, id, "configuration")
        .as_array()
        .unwrap()
        .iter()
        .find(|row| {
            row["id"]
                .as_str()
                .is_some_and(|name| name.split('@').next() == Some(aspect))
        })
        .map(|row| row["config"].clone())
}
pub(crate) fn successful(helper: &Helper, command: &str) -> Run {
    let output = compare(helper, command);
    assert!(output.status.success(), "{command}: {} {}", output.stdout, output.stderr);
    output
}
fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut output = BTreeMap::new();
    visit(root, root, &mut output);
    output
}
fn visit(root: &Path, directory: &Path, output: &mut BTreeMap<String, Vec<u8>>) {
    for entry in fs::read_dir(directory).unwrap() {
        let path = entry.unwrap().path();
        let key = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let metadata = fs::symlink_metadata(&path).unwrap();
        output.insert(format!("{key}:mode"), mode(&metadata));
        if metadata.file_type().is_symlink() {
            output.insert(key, format!("link:{:?}", fs::read_link(&path).unwrap()).into_bytes());
        } else if metadata.is_dir() {
            output.insert(format!("{key}/"), b"directory".to_vec());
            visit(root, &path, output);
        } else {
            output.insert(key, fs::read(path).unwrap());
        }
    }
}

#[cfg(unix)]
fn mode(metadata: &fs::Metadata) -> Vec<u8> {
    use std::os::unix::fs::PermissionsExt;
    metadata
        .permissions()
        .mode()
        .to_le_bytes()
        .to_vec()
}
#[cfg(not(unix))]
fn mode(metadata: &fs::Metadata) -> Vec<u8> {
    vec![u8::from(metadata.permissions().readonly())]
}
