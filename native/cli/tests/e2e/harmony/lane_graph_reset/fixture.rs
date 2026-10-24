use crate::{
    commands::{add::support::history_oracle, move_paths::support},
    helper::{Helper, Run, config, remote},
};
use serde_json::Value;
use std::{collections::BTreeMap, ffi::OsStr, fs, path::PathBuf};

pub(super) fn workspace(count: usize, tagged: bool) -> Helper {
    let helper = support::workspace(count, false);
    for index in 1..=count {
        config::set_component_env(
            &helper.scopes.local_path,
            &format!("comp{index}"),
            "teambit.harmony/empty-env",
        );
    }
    if tagged {
        support::tag(&helper);
    }
    helper
}

pub(super) fn snap(helper: &Helper, options: &str) {
    support::setup(helper, &format!("snap --ignore-issues * --message graph-reset {options}"));
}

pub(super) fn head(helper: &Helper, lane: &str, name: &str) -> String {
    let lane = support::json(helper, &format!("cat-lane {lane}"));
    lane["components"]
        .as_array()
        .expect("lane components")
        .iter()
        .find(|row| row["id"]["name"] == name)
        .expect("lane member")["head"]
        .as_str()
        .expect("lane head")
        .to_owned()
}

pub(super) fn version(helper: &Helper, name: &str, reference: &str) -> Value {
    support::json(helper, &format!("cat-component {name}@{reference} --json"))
}

pub(super) fn successful(helper: &Helper, command: &str) -> Run {
    // SnappingMain.reset ends with consumer.onDestroy('reset'); independently
    // observe the actual write rather than assuming second-resolution backups.
    let result = history_oracle::compare(helper, command, str::to_owned, ["reset"], false);
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    result
}

pub(super) fn colored_error(helper: &Helper, command: &str) {
    let environment = [("FORCE_COLOR", OsStr::new("1")), ("BIT_NATIVE_QUIET", OsStr::new("1"))];
    let expected = support::prepare_history(helper, || {
        Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[environment[0], environment[1], ("BIT_NATIVE", OsStr::new("off"))],
        )
    });
    let actual = Helper::cmd_in_with(&helper.scopes.local_path, command, &environment);
    assert!(actual.native, "{}", actual.trace);
    assert!(!actual.status.success());
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    assert!(actual.stderr.contains("\u{1b}[31m\u{1b}[31m"));
}

pub(super) fn modified_only(helper: &Helper, count: usize) {
    let status = support::json(helper, "status --json");
    assert_eq!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        count,
    );
    assert!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
}

pub(super) fn sentinels(helper: &Helper) -> BTreeMap<PathBuf, Vec<u8>> {
    fs::write(helper.scopes.local_path.join("graph-reset-untracked.bin"), b"\0\xff\r\nunchanged")
        .unwrap();
    helper.output_file("graph-reset-CRLF-untracked.txt", "unchanged\r\nsecond\r\n");
    let row = bitmap_row(&support::bitmap(helper), "comp1");
    let main = helper.scopes.local_path
        .join(row["rootDir"].as_str().unwrap())
        .join("index.js");
    [
        main,
        helper.scopes.local_path.join("graph-reset-untracked.bin"),
        helper.scopes.local_path.join("graph-reset-CRLF-untracked.txt"),
    ]
    .into_iter()
    .map(|path| {
        let bytes = fs::read(&path).unwrap();
        (path, bytes)
    })
    .collect()
}

pub(super) fn unchanged(files: &BTreeMap<PathBuf, Vec<u8>>) {
    for (path, bytes) in files {
        assert_eq!(&fs::read(path).unwrap(), bytes, "{}", path.display());
    }
}

pub(super) fn objects(helper: &Helper, references: &[String]) -> BTreeMap<PathBuf, Vec<u8>> {
    let scope = bit_object_import::scope_path(&helper.scopes.local_path).join("objects");
    let mut result = BTreeMap::new();
    for reference in references {
        let version = version(helper, "comp1", reference);
        let refs = version["files"]
            .as_array()
            .unwrap()
            .iter()
            .map(|file| file["file"].as_str().unwrap())
            .chain(std::iter::once(reference.as_str()));
        for hash in refs {
            let path = scope.join(&hash[..2]).join(&hash[2..]);
            result.insert(path.clone(), fs::read(path).unwrap());
        }
    }
    result
}

pub(super) fn bitmap_row(bitmap: &Value, name: &str) -> Value {
    bitmap
        .as_object()
        .unwrap()
        .iter()
        .find(|(key, row)| key.as_str() == name || row["name"] == name)
        .expect("bitmap member")
        .1
        .clone()
}

pub(super) fn unstaged(helper: &Helper) {
    let status = support::json(helper, "status --json");
    assert!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
}

/// A real imported component has no known replacement on this unrelated new lane.
pub(super) fn unknown_inherited() -> Helper {
    let helper = workspace(1, false);
    support::setup(&helper, "lane create dev");
    snap(&helper, "comp1");
    remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    support::setup(&helper, "lane create unrelated");
    support::setup(&helper, &format!("lane merge {}/dev -x", helper.scopes.remote));
    snap(&helper, "--unmodified comp1");
    helper
}
