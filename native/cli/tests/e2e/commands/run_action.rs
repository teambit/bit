//! Compare `bit run-action <action-name> <remote> <options>` against the released CLI.
use crate::helper::{Helper, action_server::Server};
use serde_json::{Value, json};
use std::{ffi::OsStr, fs, path::Path};

#[test]
fn run_action_dispatches_http_actions_in_workspaces_and_bare_scopes_without_node() {
    for bare in [false, true] {
        for (status, response) in [
            (200, json!("persisted")),
            (200, json!(null)),
            (200, json!({"exists":true})),
            (500, json!({"message":"fixture action failure"})),
        ] {
            let helper = Helper::new();
            helper.set_workspace_with_remote_scope();
            let root = if bare { &helper.scopes.remote_path } else { &helper.scopes.local_path };
            let server = Server::start(2, move |_| (status, response.clone()));
            configure_http(root, &server.url);
            let command = r#"run-action PendingDirStatus fixture.scope '{"clientId":"export-1"}'"#;
            let node = Helper::cmd_in_with(root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
            let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
            let native =
                Helper::cmd_in_with(root, command, &[("BIT_NODE_BINARY", unavailable.as_os_str())]);
            assert!(
                native.native && !native.trace.contains("starting the JavaScript host"),
                "{native:?}",
            );
            assert_eq!(node.status.success(), status == 200, "{node:?}");
            assert_eq!(native.stdout, node.stdout, "{node:?} {native:?}");
            assert_eq!(native.stderr, node.stderr);
            assert_eq!(native.status.code(), node.status.code());
            let requests = server.finish();
            assert_eq!(requests[0], requests[1]);
            assert_eq!(
                requests[0].body,
                json!({"name":"PendingDirStatus","options":{"clientId":"export-1"}}),
            );
        }
    }
}

#[test]
fn run_action_executes_file_pending_directory_actions_and_declines_other_file_actions() {
    for action in ["PendingDirStatus", "RemovePendingDir"] {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let pending = helper.scopes.remote_path.join("pending-objects/export-1");
        fs::create_dir_all(&pending).unwrap();
        fs::write(pending.join("object"), "fixture").unwrap();
        let baseline = helper.clone_remote_scope();
        let command =
            format!(r#"run-action {action} {} '{{"clientId":"export-1"}}'"#, helper.scopes.remote);
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let expected = crate::commands::move_paths::support::tree(&helper.scopes.remote_path);
        helper.restore_remote_scope(&baseline);
        let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
        let native = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &command,
            &[
                ("BIT_NODE_BINARY", unavailable.as_os_str()),
                ("BIT_NODE_CLI", unavailable.as_os_str()),
            ],
        );
        assert!(
            native.native && !native.trace.contains("starting the JavaScript host"),
            "{native:?}",
        );
        assert_eq!(native.stdout, node.stdout, "{node:?} {native:?}");
        assert_eq!(native.stderr, node.stderr);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(
            crate::commands::move_paths::support::tree(&helper.scopes.remote_path),
            expected,
        );
    }

    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let before = crate::commands::move_paths::support::tree(&helper.scopes.remote_path);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
    let declined = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &format!(
            r#"run-action ExportPersist {} '{{"clientId":"export-1"}}'"#,
            helper.scopes.remote,
        ),
        &[("BIT_NODE_BINARY", unavailable.as_os_str())],
    );
    assert!(!declined.native, "{declined:?}");
    assert_eq!(crate::commands::move_paths::support::tree(&helper.scopes.remote_path), before);
}

fn configure_http(root: &Path, url: &str) {
    let config = if root.join("scope.json").is_file() {
        root.join("scope.json")
    } else {
        root.join(".bit/scope.json")
    };
    let mut scope: Value = serde_json::from_slice(&fs::read(&config).unwrap()).unwrap();
    scope["remotes"] = json!({"fixture.scope":url});
    fs::write(config, serde_json::to_vec_pretty(&scope).unwrap()).unwrap();
}
