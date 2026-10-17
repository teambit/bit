//! Real repository checkout preserves platform bytes and removes obsolete component sources.
mod license;
use crate::helper::{Helper, config};
use std::{ffi::OsStr, fs, path::PathBuf};

fn versions() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = 'first';\n");
    helper.output_file("bar/first.txt", "first\r\nsource\r\n");
    helper.output_file("bar/data.bin", "binary\0\r\n");
    helper.run("add bar -i bar/foo -m foo.js");
    helper.tag_without_build("", "");
    helper.create_component_bar_foo("module.exports = 'second';\n");
    helper.delete_path("bar/first.txt");
    helper.output_file("bar/nested/second.txt", "second\r\nsource\r\n");
    helper.tag_without_build("", "");
    helper
}

fn compare(helper: &Helper, command: &str) -> PathBuf {
    let baseline = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &baseline,
        command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    let native =
        Helper::cmd_in_with(&helper.scopes.local_path, command, &[("CI", OsStr::new("1"))]);
    assert!(native.native, "{}", native.trace);
    assert_eq!(
        native.status.code(),
        node.status.code(),
        "native: {} {}\ntrace: {}\nNode: {} {}",
        native.stdout,
        native.stderr,
        native.trace,
        node.stdout,
        node.stderr,
    );
    assert_eq!(stable_output(&native.stdout), stable_output(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&baseline.join(".bitmap")),
    );
    for file in ["foo.js", "first.txt", "nested/second.txt", "data.bin"] {
        assert_eq!(
            source_file(&helper.scopes.local_path.join("bar").join(file)),
            source_file(&baseline.join("bar").join(file)),
            "{file}",
        );
    }
    baseline
}

#[test]
fn checkout_stored_sources_preserves_binary_and_platform_eol_and_removes_obsolete_files() {
    let helper = versions();
    compare(&helper, "checkout 0.0.1 bar/foo -x");
    assert!(helper.scopes.local_path.join("bar/first.txt").is_file());
    assert!(!helper.scopes.local_path.join("bar/nested/second.txt").exists());
    assert_eq!(fs::read(helper.scopes.local_path.join("bar/data.bin")).unwrap(), b"binary\0\r\n");
}

#[test]
fn revert_stored_sources_preserves_current_version_and_obsolete_file_behavior() {
    let helper = versions();
    helper.create_component_bar_foo("module.exports = 'locally edited';\n");
    compare(&helper, "revert bar/foo 0.0.1 -x");
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["bar/foo"]["version"], "0.0.2");
}

#[test]
fn reset_restores_missing_directory_and_binary_sources_without_changing_versions() {
    let helper = versions();
    helper.delete_path("bar");
    compare(&helper, "checkout reset bar/foo -x");
    assert!(helper.scopes.local_path.join("bar/nested/second.txt").is_file());
    assert_eq!(fs::read(helper.scopes.local_path.join("bar/data.bin")).unwrap(), b"binary\0\r\n");
}

// Complete-command import timings legitimately differ; retain every report line.
fn stable_output(output: &str) -> String {
    output
        .lines()
        .map(|line| {
            line.split_once(" (completed in ")
                .map_or_else(|| line.to_owned(), |(label, _)| format!("{label} (completed)"))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn lane_switch_restores_deleted_and_added_sources_with_platform_bytes() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'main';\n");
    helper.output_file("bar/first.txt", "main\r\nsource\r\n");
    helper.output_file("bar/data.bin", "binary\0\r\n");
    helper.run("add bar -i bar/foo -m foo.js");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.create_component_bar_foo("module.exports = 'lane';\n");
    helper.delete_path("bar/first.txt");
    helper.output_file("bar/nested/second.txt", "lane\r\nsource\r\n");
    helper.run("snap --message lane");
    crate::helper::remote::publish(&helper);
    helper.run("switch main -x");
    compare(&helper, "switch dev -x");
    compare(&helper, "switch main --skip-fetch -x");
    compare(&helper, "switch dev --skip-fetch -x");
    assert!(!helper.scopes.local_path.join("bar/first.txt").exists());
    assert!(helper.scopes.local_path.join("bar/nested/second.txt").is_file());
}

#[test]
fn corrupt_target_source_cannot_publish_partial_workspace_changes() {
    let helper = versions();
    let object = first_source_object(&helper);
    fs::write(&object, b"invalid compressed Source").unwrap();
    let bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let source = fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    let baseline = helper.clone_workspace();
    let node = Helper::cmd_in_with(
        &baseline,
        "checkout 0.0.1 bar/foo -x",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let native = helper.cmd("checkout 0.0.1 bar/foo -x");
    assert!(!native.status.success());
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(stable_output(&native.stdout), stable_output(&node.stdout));
    assert_eq!(
        native.stderr.replace(&helper.scopes.local_path.display().to_string(), "<workspace>"),
        node.stderr.replace(&baseline.display().to_string(), "<workspace>"),
    );
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), bitmap);
    assert_eq!(fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(), source);
    assert_eq!(fs::read(object).unwrap(), b"invalid compressed Source");
    assert!(!helper.scopes.local_path.join("bar/first.txt").exists());
}

#[test]
fn root_checkout_restores_readme_without_rewinding_live_bitmap_or_nested_components() {
    let helper = root_versions();
    let baseline = compare(&helper, "checkout 0.0.1 ws-root -x");
    assert_eq!(
        fs::read(helper.scopes.local_path.join("README.md")).unwrap(),
        fs::read(baseline.join("README.md")).unwrap(),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(),
        b"module.exports = 'second';\n",
    );
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["comp1"]["version"], "0.0.2");
    assert_eq!(bitmap["ws-root"]["version"], "0.0.1");
    assert!(bit_object_import::scope_path(&helper.scopes.local_path).join("objects").is_dir());
    assert!(helper.scopes.local_path.join("workspace.jsonc").is_file());
}

fn first_source_object(helper: &Helper) -> PathBuf {
    let version = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "cat-component bar/foo@0.0.1 --json",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(version.status.success(), "{}", version.stderr);
    let version = crate::helper::parse(&version.stdout);
    let reference = version["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|file| file["relativePath"] == "first.txt")
        .unwrap()["file"]
        .as_str()
        .unwrap();
    bit_object_import::scope_path(&helper.scopes.local_path)
        .join("objects")
        .join(&reference[..2])
        .join(&reference[2..])
}

fn root_versions() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(1, false, "");
    helper.output_file("README.md", "# first root\n");
    helper.run("add . -i ws-root --root");
    for (readme, member) in [("# first root\n", "first"), ("# second root\n", "second")] {
        helper.output_file("README.md", readme);
        helper.output_file("comp1/index.js", &format!("module.exports = '{member}';\n"));
        let setup = Helper::cmd_in_with(
            &helper.scopes.local_path,
            "tag --ignore-issues * --message root",
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(setup.status.success(), "{} {}", setup.stdout, setup.stderr);
    }
    helper
}

fn source_file(path: &std::path::Path) -> Option<Vec<u8>> {
    match fs::read(path) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => panic!("read source {path:?}: {error}"),
    }
}

#[test]
fn embedded_git_scope_checkout_keeps_history_in_the_actual_repository() {
    let helper = versions();
    fs::create_dir(helper.scopes.local_path.join(".git")).unwrap();
    fs::rename(helper.scopes.local_path.join(".bit"), helper.scopes.local_path.join(".git/bit"))
        .unwrap();
    compare(&helper, "checkout 0.0.1 bar/foo -x");
    assert!(!helper.scopes.local_path.join(".bit").exists());
    assert!(helper.scopes.local_path.join(".git/bit/bitmap-history").is_dir());
}

#[test]
fn binary_conflict_strategies_match_node_for_binary_and_text_extensions() {
    for filename in ["image.PNG", "encoded.txt"] {
        for strategy in ["--manual", "--auto-merge-resolve ours", "--auto-merge-resolve theirs"] {
            binary_conflict(filename, strategy);
        }
    }
}

fn binary_conflict(filename: &str, strategy: &str) {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("module.exports = 'binary conflict';\n");
    let relative = format!("bar/{filename}");
    helper.output_file(&relative, "first\0\r\n");
    helper.run("add bar -i bar/foo -m foo.js");
    helper.tag_without_build("", "");
    helper.output_file(&relative, "second\0\r\n");
    helper.tag_without_build("", "");
    helper.run("checkout 0.0.1 bar/foo -x");
    helper.output_file(&relative, "local\0\r\n");
    let baseline = compare(&helper, &format!("checkout 0.0.2 bar/foo {strategy} -x"));
    assert_eq!(
        fs::read(helper.scopes.local_path.join(&relative)).unwrap(),
        fs::read(baseline.join(&relative)).unwrap(),
    );
}
