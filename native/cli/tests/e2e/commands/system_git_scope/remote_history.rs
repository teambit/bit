//! Compare remote history action requests and reports against the released CLI.
use crate::helper::{Helper, action_server::Server};
use serde_json::{Value, json};
use std::{ffi::OsStr, fs};

#[test]
fn remote_history_rebuild_dispatches_without_a_javascript_host() {
    let command = "version-history build 'one*' --remote fixture.scope --from-snap aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --from-all-lanes --delete-existing";
    let request = compare(
        command,
        json!({"fixture.scope/one":{"added":["a","b"]},"fixture.scope/two":{}}),
        &[],
    );
    assert_eq!(
        request,
        json!({"name":"BuildVersionHistoryAction","options":{"pattern":"one*","from-snap":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","fromSnap":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","from-all-lanes":true,"fromAllLanes":true,"delete-existing":true,"deleteExisting":true,"component-pattern":"one*","componentPattern":"one*"}}),
    );
}

#[test]
fn remote_history_reports_errors_and_empty_results_in_color_and_ci() {
    for (response, environment) in [
        (
            json!({"fixture.scope/one":{"err":{"message":"fixture failure"}}}),
            vec![("FORCE_COLOR", OsStr::new("1"))],
        ),
        (json!({}), vec![("CI", OsStr::new("1"))]),
    ] {
        let request =
            compare("version-history build comp1 --remote fixture.scope", response, &environment);
        assert_eq!(
            request,
            json!({"name":"BuildVersionHistoryAction","options":{"pattern":"comp1","component-pattern":"comp1","componentPattern":"comp1"}}),
        );
    }
}

#[test]
fn remote_history_owns_http_failure_after_dispatch() {
    let request = compare_status(
        "version-history build comp1 --remote fixture.scope",
        500,
        json!({"message":"fixture action failure"}),
        &[],
    );
    assert_eq!(request["name"], "BuildVersionHistoryAction");
}

#[test]
fn remote_history_honors_no_color() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let root = &helper.scopes.local_path;
    let command = "version-history build comp1 --remote fixture.scope --no-color";
    let node = Helper::cmd_in_with(root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let result = Helper::cmd_in(root, command);
    assert!(!result.native, "{result:?}");
    assert_eq!(result.stdout, node.stdout);
    assert_eq!(result.stderr, node.stderr);
    assert_eq!(result.status.code(), node.status.code());
}

#[test]
fn remote_history_declines_custom_startup_before_any_request() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let root = &helper.scopes.local_path;
    let path = root.join(".bit/scope.json");
    let mut scope: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    scope["remotes"] =
        json!({"fixture.scope":format!("http://{}", listener.local_addr().unwrap())});
    fs::write(path, serde_json::to_vec_pretty(&scope).unwrap()).unwrap();
    let path = root.join("workspace.jsonc");
    let mut workspace = bit_workspace_config::parse_jsonc(&fs::read(&path).unwrap()).unwrap();
    workspace["fixture.scope/custom-aspect"] = json!({});
    fs::write(path, serde_json::to_vec_pretty(&workspace).unwrap()).unwrap();
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let result = Helper::cmd_in_with(
        root,
        "version-history build comp1 --remote fixture.scope",
        &[("BIT_NODE_BINARY", unavailable.as_os_str())],
    );
    assert!(!result.native, "{result:?}");
    assert_eq!(listener.accept().unwrap_err().kind(), std::io::ErrorKind::WouldBlock);
}

#[test]
fn remote_history_rebuild_changes_real_http_scope_once() {
    use sha1::{Digest, Sha1};
    let helper = crate::commands::scope_fixture::fixture();
    let scope = &helper.scopes.remote_path;
    let hash =
        format!("{:x}", Sha1::digest(format!("{}/comp1:VersionHistory", helper.scopes.remote)));
    let history = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    if history.exists() {
        fs::remove_file(&history).unwrap();
    }
    let baseline = helper.clone_remote_scope();
    let command = format!("version-history build comp1 --remote {}", helper.scopes.remote);
    let server = crate::commands::diff_completion::http::start(&helper);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let expected = crate::commands::move_paths::support::tree(scope);
    drop(server);
    helper.restore_remote_scope(&baseline);
    let server = crate::commands::diff_completion::http::start(&helper);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let native = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NODE_BINARY", unavailable.as_os_str())],
    );
    assert!(native.native && native.status.success(), "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(crate::commands::move_paths::support::tree(scope), expected);
    drop(server);
}

#[test]
fn remote_file_history_uses_the_client_workspace_without_a_host() {
    use sha1::{Digest, Sha1};
    let helper = crate::commands::scope_fixture::fixture();
    let scope = &helper.scopes.remote_path;
    let hash =
        format!("{:x}", Sha1::digest(format!("{}/comp1:VersionHistory", helper.scopes.remote)));
    let history = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    if history.exists() {
        fs::remove_file(&history).unwrap();
    }
    let remote_before = crate::commands::move_paths::support::tree(scope);
    let baseline = helper.clone_workspace();
    let command = format!("version-history build comp1 --remote {}", helper.scopes.remote);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    assert!(node.stdout.contains("no changes"));
    assert_eq!(crate::commands::move_paths::support::tree(scope), remote_before);
    let expected = workspace_scope_tree(&helper);
    helper.get_cloned_workspace(&baseline);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let native = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NODE_BINARY", unavailable.as_os_str())],
    );
    assert!(native.native && native.status.success(), "{native:?}");
    assert!(!native.trace.contains("starting the JavaScript host"), "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(crate::commands::move_paths::support::tree(scope), remote_before);
    let actual = workspace_scope_tree(&helper);
    let differences: Vec<_> = actual
        .keys()
        .chain(expected.keys())
        .filter(|key| actual.get(*key) != expected.get(*key))
        .collect();
    assert!(differences.is_empty(), "{differences:?}");
}

#[test]
fn remote_file_incomplete_client_history_declines_before_mutation() {
    use sha1::{Digest, Sha1};
    let helper = crate::commands::scope_fixture::fixture();
    let hash =
        format!("{:x}", Sha1::digest(format!("{}/comp1:VersionHistory", helper.scopes.remote)));
    let local = helper.scopes.local_path.join(".bit");
    let history = local
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    if history.exists() {
        fs::remove_file(&history).unwrap();
    }
    let remote_before = crate::commands::move_paths::support::tree(&helper.scopes.remote_path);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let command = format!("version-history build comp1 --remote {}", helper.scopes.remote);
    let run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NODE_BINARY", unavailable.as_os_str())],
    );
    assert!(!run.native, "{run:?}");
    assert!(!history.exists());
    assert_eq!(
        crate::commands::move_paths::support::tree(&helper.scopes.remote_path),
        remote_before,
    );
}

#[test]
fn remote_file_invalid_unmerged_state_declines_before_mutation() {
    let helper = crate::commands::scope_fixture::fixture();
    let scope = &helper.scopes.remote_path;
    fs::write(scope.join("unmerged.json"), b"{invalid").unwrap();
    let before = crate::commands::move_paths::support::tree(scope);
    let command = format!("version-history build comp1 --remote {}", helper.scopes.remote);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(!node.status.success(), "{node:?}");
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NODE_BINARY", unavailable.as_os_str())],
    );
    assert!(!run.native, "{run:?}");
    assert_eq!(crate::commands::move_paths::support::tree(scope), before);
}

#[test]
fn bare_remote_history_uses_global_remotes_and_declines_local_scope_remotes() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let root = &helper.scopes.remote_path;
    let globals = helper.scopes.e2e_dir.join("globals");
    fs::create_dir_all(globals.join("config")).unwrap();
    fs::copy(
        crate::helper::setup::shared().root.join("globals/config/config.json"),
        globals.join("config/config.json"),
    )
    .unwrap();
    let server = Server::start(2, |_| (200, json!({"fixture.scope/comp1":{"added":["a"]}})));
    fs::write(
        globals.join("config/global-remotes.json"),
        serde_json::to_vec_pretty(&json!({"fixture.scope":server.url})).unwrap(),
    )
    .unwrap();
    let command = "version-history build comp1 --remote fixture.scope";
    let node = Helper::cmd_in_with(
        root,
        command,
        &[("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NATIVE", OsStr::new("off"))],
    );
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let native = Helper::cmd_in_with(
        root,
        command,
        &[("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NODE_BINARY", unavailable.as_os_str())],
    );
    assert!(native.native && !native.trace.contains("starting the JavaScript host"), "{native:?}");
    assert!(node.status.success(), "{node:?}");
    assert_eq!(native.stdout, node.stdout, "{node:?} {native:?}");
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(native.status.code(), node.status.code());
    let requests = server.finish();
    assert_eq!(requests[0], requests[1]);

    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let config = root.join("scope.json");
    let mut scope: Value = serde_json::from_slice(&fs::read(&config).unwrap()).unwrap();
    scope["remotes"] = json!({"local.only":format!("http://{}", listener.local_addr().unwrap())});
    fs::write(config, serde_json::to_vec_pretty(&scope).unwrap()).unwrap();
    let declined = Helper::cmd_in_with(
        root,
        "version-history build comp1 --remote local.only",
        &[("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NODE_BINARY", unavailable.as_os_str())],
    );
    assert!(!declined.native, "{declined:?}");
    assert_eq!(listener.accept().unwrap_err().kind(), std::io::ErrorKind::WouldBlock);
}

#[test]
fn bare_remote_file_history_rebuilds_the_caller_bare_scope_without_a_host() {
    use sha1::{Digest, Sha1};
    let helper = crate::commands::scope_fixture::fixture();
    let (_, target_path) = helper.new_bare_scope();
    let globals = helper.scopes.e2e_dir.join("globals");
    fs::create_dir_all(globals.join("config")).unwrap();
    fs::copy(
        crate::helper::setup::shared().root.join("globals/config/config.json"),
        globals.join("config/config.json"),
    )
    .unwrap();
    fs::write(
        globals.join("config/global-remotes.json"),
        serde_json::to_vec_pretty(&json!({
            "fixture.file": format!("file://{}", target_path.display()),
        }))
        .unwrap(),
    )
    .unwrap();
    let scope = &helper.scopes.remote_path;
    let hash =
        format!("{:x}", Sha1::digest(format!("{}/comp1:VersionHistory", helper.scopes.remote)));
    let history = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    if history.exists() {
        fs::remove_file(&history).unwrap();
    }
    let baseline = helper.clone_remote_scope();
    let target_before = crate::commands::move_paths::support::tree(&target_path);
    let command = "version-history build comp1 --remote fixture.file";
    let node = Helper::cmd_in_with(
        scope,
        command,
        &[("BIT_GLOBALS_DIR", globals.as_os_str()), ("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(node.status.success(), "{node:?}");
    let expected = crate::commands::move_paths::support::tree(scope);
    assert_eq!(crate::commands::move_paths::support::tree(&target_path), target_before);
    helper.restore_remote_scope(&baseline);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let native = Helper::cmd_in_with(
        scope,
        command,
        &[
            ("BIT_GLOBALS_DIR", globals.as_os_str()),
            ("BIT_NODE_BINARY", unavailable.as_os_str()),
            ("BIT_NODE_CLI", unavailable.as_os_str()),
        ],
    );
    assert!(native.native && !native.trace.contains("starting the JavaScript host"), "{native:?}");
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(crate::commands::move_paths::support::tree(scope), expected);
    assert_eq!(crate::commands::move_paths::support::tree(&target_path), target_before);
}

fn workspace_scope_tree(helper: &Helper) -> std::collections::BTreeMap<String, Vec<u8>> {
    let mut tree =
        crate::commands::move_paths::support::tree(&helper.scopes.local_path.join(".bit"));
    if let Some(history) = tree.get_mut("command-history") {
        let text = std::str::from_utf8(history).unwrap();
        *history = text
            .lines()
            .map(|line| {
                let mut fields = line.splitn(3, ' ');
                chrono::DateTime::parse_from_rfc3339(fields.next().unwrap()).unwrap();
                fields
                    .next()
                    .unwrap()
                    .parse::<u32>()
                    .unwrap();
                fields.next().unwrap()
            })
            .collect::<Vec<_>>()
            .join("\n")
            .into_bytes();
    }
    tree
}

fn compare(command: &str, response: Value, environment: &[(&str, &OsStr)]) -> Value {
    compare_status(command, 200, response, environment)
}

fn compare_status(
    command: &str,
    status: u16,
    response: Value,
    environment: &[(&str, &OsStr)],
) -> Value {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let server = Server::start(2, move |_| (status, response.clone()));
    let root = &helper.scopes.local_path;
    let config = root.join(".bit/scope.json");
    let mut scope: Value = serde_json::from_slice(&fs::read(&config).unwrap()).unwrap();
    scope["remotes"] = json!({"fixture.scope":server.url});
    fs::write(config, serde_json::to_vec_pretty(&scope).unwrap()).unwrap();
    let mut node_env = environment.to_vec();
    node_env.push(("BIT_NATIVE", OsStr::new("off")));
    let node = Helper::cmd_in_with(root, command, &node_env);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let mut native_env = environment.to_vec();
    native_env.push(("BIT_NODE_BINARY", unavailable.as_os_str()));
    let native = Helper::cmd_in_with(root, command, &native_env);
    assert!(native.native && !native.trace.contains("starting the JavaScript host"), "{native:?}");
    assert_eq!(node.status.success(), status == 200, "{node:?}");
    assert_eq!(native.stdout, node.stdout, "{node:?} {native:?}");
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(native.status.code(), node.status.code());
    let requests = server.finish();
    assert_eq!(requests[0], requests[1]);
    requests
        .into_iter()
        .next()
        .unwrap()
        .body
}
