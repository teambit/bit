//! Compiled extension hydration stays an adapter around Rust checkout selection and files.
use crate::helper::{Helper, config};
use std::{ffi::OsStr, fs};

#[test]
fn checkout_with_compiled_onload_callbacks_matches_node() {
    let helper = super::snapshot_environments::callback_workspace(false);
    for message in ["initial", "second"] {
        helper.append_file("bar/foo.js", &format!("\n// checkout {message}\n"));
        let tagged = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &format!("tag bar/foo -m {message}"),
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(tagged.status.success(), "{} {}", tagged.stdout, tagged.stderr);
    }
    helper.output_file(".bitTmp/stale-materialization", "reserved checkout temporary state");
    let oracle = helper.clone_workspace();
    for (command, success) in [
        ("checkout 0.0.1 bar/foo -x", false),
        ("checkout 0.0.1 bar/foo --force-theirs -x", true),
        (r#"checkout reset "$modified AND bar/*" -x"#, true),
        ("revert bar/foo 0.0.2 -x", true),
    ] {
        compare(&helper, &oracle, command, success);
        assert_eq!(
            helper.scopes.local_path.join(".bitTmp").exists(),
            oracle.join(".bitTmp").exists(),
        );
    }
}

fn compare(helper: &Helper, oracle: &std::path::Path, command: &str, success: bool) {
    let native = helper.native_run(command);
    let node = Helper::cmd_in_with(oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native.status.success(), success, "{} {}", native.stdout, native.stderr);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stderr, node.stderr);
    assert_eq!(
        stable_output(&native.stdout),
        stable_output(&node.stdout),
        "native stderr: {}\nnode stderr: {}",
        native.stderr,
        node.stderr,
    );
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&oracle.join(".bitmap")),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("bar/component.json")).unwrap(),
        fs::read(oracle.join("bar/component.json")).unwrap(),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
        fs::read(oracle.join("bar/foo.js")).unwrap(),
    );
}

pub(super) fn stable_output(output: &str) -> String {
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
fn failed_checkout_callback_is_not_replayed_and_keeps_the_workspace() {
    let helper = super::snapshot_environments::callback_workspace(false);
    helper.run("tag bar/foo -m initial");
    helper.output_file("checkout-load-fails", "fail");
    let before = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let source = fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap();
    let oracle = helper.clone_workspace();
    for command in ["checkout reset bar/foo -x", "U reset bar/foo -x", "revert bar/foo 0.0.1 -x"] {
        failed_callback_command(&helper, &oracle, &before, &source, command);
    }
}

fn failed_callback_command(
    helper: &Helper,
    oracle: &std::path::Path,
    before: &[u8],
    source: &[u8],
    command: &str,
) {
    let native = helper.native_run(command);
    let node = Helper::cmd_in_with(oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(
        stable_output(&native.stdout),
        stable_output(&node.stdout),
        "{command} native error: {}\nnode error: {}",
        native.stderr,
        node.stderr,
    );
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        fs::read(helper.scopes.local_path.join("checkout-load-count")).unwrap(),
        fs::read(oracle.join("checkout-load-count")).unwrap(),
    );
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), before);
    assert_eq!(fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(), source);
}

#[cfg(unix)]
#[test]
fn unsupported_checkout_transport_declines_before_running_configured_providers() {
    let helper = super::snapshot_environments::callback_workspace(false);
    helper.run("tag bar/foo -m initial");
    helper.re_init_remote_scope();
    helper.add_remote_scope();
    helper.run("export");
    let root = &helper.scopes.local_path;
    let scope_path = root.join(".bit/scope.json");
    let mut scope = config::read_jsonc(&scope_path);
    scope["remotes"][&helper.scopes.remote] = serde_json::json!("https://unsupported.invalid");
    fs::write(scope_path, scope.to_string()).unwrap();
    let wrapper = tempfile::tempdir().unwrap();
    fs::create_dir(wrapper.path().join("bin")).unwrap();
    let entry = wrapper.path().join("bin/bit.js");
    fs::write(&entry, r"process.stdout.write('canonical checkout fallback\n');").unwrap();
    let oracle_entry = &crate::helper::setup::shared().node_cli;
    let modules = oracle_entry
        .ancestors()
        .find(|path| path.file_name() == Some(OsStr::new("node_modules")))
        .unwrap();
    std::os::unix::fs::symlink(modules, wrapper.path().join("node_modules")).unwrap();
    let before = fs::read(root.join(".bitmap")).unwrap();
    let run = Helper::cmd_in_with(
        root,
        "checkout head bar/foo -x",
        &[("BIT_NODE_CLI", entry.as_os_str())],
    );
    assert!(!run.native, "{}", run.trace);
    assert_eq!(run.stdout, "canonical checkout fallback\n");
    assert!(
        run.trace.contains("import remote protocol requires canonical transport"),
        "{}",
        run.trace,
    );
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), before);
}

#[test]
fn lane_switch_with_compiled_callbacks_matches_node_and_retains_cache_prefix() {
    let helper = super::snapshot_environments::callback_workspace(false);
    helper.re_init_remote_scope();
    helper.add_remote_scope();
    for command in ["tag bar/foo -m initial", "lane create dev"] {
        let setup = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(setup.status.success(), "{} {}", setup.stdout, setup.stderr);
        if command.starts_with("tag ") {
            crate::helper::remote::publish(&helper);
        }
    }
    helper.append_file("bar/foo.js", "\n// lane source\n");
    let setup = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "snap bar/foo -m dev",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(setup.status.success(), "{} {}", setup.stdout, setup.stderr);
    helper.output_file(".bitTmp/checkout-read-prefix", "reserved temporary state");
    let oracle = helper.clone_workspace();
    for (command, success) in [
        ("switch main -x", false),
        ("switch main --force-theirs -x", true),
        ("switch dev --skip-fetch --force-theirs -x", true),
    ] {
        compare(&helper, &oracle, command, success);
        assert_eq!(
            helper.scopes.local_path.join(".bitTmp").exists(),
            oracle.join(".bitTmp").exists(),
        );
    }
}
