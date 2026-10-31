//! Export recovery protocol, failures and reports against the released CLI.
mod file;

use crate::helper::{
    Helper,
    action_server::{Request, Server},
};
use serde_json::{Value, json};
use std::{
    ffi::OsStr,
    fs,
    path::Path,
    sync::{Arc, Barrier},
};

#[test]
fn export_recovery_validates_all_remotes_then_persists_without_node() {
    for bare in [false, true] {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let barrier = Arc::new(Barrier::new(2));
        let servers = ["fixture.one", "fixture.two"].map(|scope| {
            validation_server(scope, Arc::clone(&barrier))
        });
        let root = if bare { &helper.scopes.remote_path } else { &helper.scopes.local_path };
        configure(root, &[(&servers[0], "fixture.one"), (&servers[1], "fixture.two")]);
        compare(&helper, root, "resume-export fixture-export fixture.one fixture.two");
        for server in servers {
            let calls = server.finish();
            assert_eq!(calls[..2], calls[2..]);
            verify(&calls[..2], 1);
        }
    }
}

fn validation_server(scope: &'static str, barrier: Arc<Barrier>) -> Server {
    Server::start(4, move |request| {
        if request.body["name"] == "ExportValidate" {
            barrier.wait();
            return (200, json!({}));
        }
        assert_eq!(request.body["name"], "ExportPersist");
        (200, json!([format!("{scope}/component@0.0.1")]))
    })
}

#[test]
fn export_recovery_retries_persistence_only_and_retains_pending_on_failure() {
    for failures in [2, 3] {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let mut attempts = 0;
        let server = Server::start(8, move |request| {
            if request.body["name"] == "ExportValidate" {
                attempts = 0;
                return (200, json!({}));
            }
            assert_eq!(request.body["name"], "ExportPersist");
            attempts += 1;
            if attempts <= failures {
                (500, json!({"message":"fixture persist failure"}))
            } else {
                (200, json!(["fixture.one/component@0.0.1"]))
            }
        });
        configure(&helper.scopes.local_path, &[(&server, "fixture.one")]);
        compare(&helper, &helper.scopes.local_path, "resume-export fixture-export fixture.one");
        let calls = server.finish();
        assert_eq!(calls[..4], calls[4..]);
        verify(&calls[..4], 3);
    }
}

#[test]
fn pending_export_deletion_probes_before_removing_and_preserves_reports() {
    for (probe, removed, force, count) in [
        ((200, json!({"exists":true})), (200, json!({"existed":true})), true, 4),
        ((200, json!({"exists":true})), (200, json!({"existed":false})), true, 4),
        ((200, json!({"exists":false})), (200, json!(null)), true, 2),
        ((200, json!({})), (200, json!(null)), true, 4),
        ((500, json!({"error":{"code":135,"name":"PendingDirStatus"}})), (200, json!({})), true, 4),
        ((500, json!({"message":"fixture probe failure"})), (200, json!(null)), true, 2),
        (
            (200, json!({"exists":true})),
            (500, json!({"message":"fixture deletion failure"})),
            true,
            4,
        ),
        ((200, json!({"exists":true})), (200, json!({})), false, 2),
    ] {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let server =
            Server::start(count, move |request| match request.body["name"].as_str().unwrap() {
                "PendingDirStatus" => probe.clone(),
                "RemovePendingDir" => removed.clone(),
                other => panic!("unexpected action {other}"),
            });
        configure(&helper.scopes.local_path, &[(&server, "fixture.one")]);
        let flag = if force { "--force" } else { "" };
        compare(
            &helper,
            &helper.scopes.local_path,
            &format!("resume-export fixture-export fixture.one fixture.one --delete {flag}"),
        );
        let calls = server.finish();
        assert_eq!(calls[..count / 2], calls[count / 2..]);
        assert_eq!(
            calls[0].body,
            json!({"name":"PendingDirStatus","options":{"clientId":"fixture-export"}}),
        );
        if count == 4 {
            assert_eq!(
                calls[1].body,
                json!({"name":"RemovePendingDir","options":{"clientId":"fixture-export"}}),
            );
        }
    }
}

#[test]
fn pending_export_deletion_leaves_absent_and_failed_scopes_untouched() {
    for pending in [false, true] {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let present = Server::start(if pending { 4 } else { 2 }, move |request| {
            match request.body["name"].as_str().unwrap() {
                "PendingDirStatus" => (200, json!({"exists":pending})),
                "RemovePendingDir" => {
                    assert!(pending);
                    (200, json!({"existed":true}))
                }
                other => panic!("unexpected action {other}"),
            }
        });
        let absent = Server::start(2, |request| {
            assert_eq!(request.body["name"], "PendingDirStatus");
            (200, json!({"exists":false}))
        });
        let failed = Server::start(2, |request| {
            assert_eq!(request.body["name"], "PendingDirStatus");
            (500, json!({"message":"fixture unavailable"}))
        });
        let root = &helper.scopes.remote_path;
        configure(
            root,
            &[
                (&present, "fixture.present"),
                (&absent, "fixture.absent"),
                (&failed, "fixture.failed"),
            ],
        );
        // A single in-flight request also makes the two absent answers deterministic.
        let path = root.join("scope.json");
        let mut scope: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        scope["config"] = json!({"concurrency.fetch":1});
        fs::write(path, serde_json::to_vec_pretty(&scope).unwrap()).unwrap();
        compare(
            &helper,
            root,
            "resume-export fixture-export fixture.present fixture.absent fixture.failed --delete --force",
        );
        for server in [present, absent, failed] {
            let calls = server.finish();
            assert_eq!(calls[..calls.len() / 2], calls[calls.len() / 2..]);
        }
    }
}

#[test]
fn export_validation_failure_never_persists_or_deletes_pending_objects() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let server = Server::start(2, |request| {
        assert_eq!(request.body["name"], "ExportValidate");
        (500, json!({"message":"fixture validation failure"}))
    });
    configure(&helper.scopes.local_path, &[(&server, "fixture.one")]);
    compare(&helper, &helper.scopes.local_path, "resume-export fixture-export fixture.one");
    let calls = server.finish();
    assert_eq!(calls[0], calls[1]);
}

#[test]
fn export_recovery_formats_structured_remote_errors() {
    for error in [
        json!({"code":131,"idsAndVersionsWithConflicts":[{"id":"fixture.scope/component","versions":["0.0.1"]}],"idsNeedUpdate":[]}),
        json!({"code":131,"idsAndVersionsWithConflicts":[{"id":"fixture.scope/deleted","versions":[],"isDeleted":true}],"idsNeedUpdate":[{"id":"fixture.scope/component","lane":"fixture/lane"}]}),
        json!({"code":135,"name":"ExportValidate"}),
        json!({"code":136,"clientId":"fixture-client"}),
        json!({"code":137,"queueSize":3,"currentExportId":"fixture-other"}),
        json!({"code":138,"scopeName":"fixture.scope","laneName":"fixture-lane"}),
    ] {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let server = Server::start(2, move |_| (500, json!({"error":error})));
        configure(&helper.scopes.local_path, &[(&server, "fixture.one")]);
        compare(&helper, &helper.scopes.local_path, "resume-export fixture-export fixture.one");
        let calls = server.finish();
        assert_eq!(calls[0], calls[1]);
    }
}

#[test]
fn export_deletion_reports_match_with_ci_and_forced_colors() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let server = Server::start(16, |request| match request.body["name"].as_str().unwrap() {
        "PendingDirStatus" => (200, json!({"exists":true})),
        "RemovePendingDir" => (200, json!({"existed":false})),
        other => panic!("unexpected action {other}"),
    });
    configure(&helper.scopes.local_path, &[(&server, "fixture.one")]);
    for environment in [
        vec![],
        vec![("CI", OsStr::new("1"))],
        vec![("FORCE_COLOR", OsStr::new("1"))],
        vec![("BIT_DISABLE_SPINNER", OsStr::new("1"))],
    ] {
        compare_with(
            &helper,
            &helper.scopes.local_path,
            "resume-export fixture-export fixture.one --delete --force",
            &environment,
        );
    }
    let calls = server.finish();
    for pair in calls.chunks_exact(2) {
        assert_eq!(pair, &calls[..2]);
    }
}

#[test]
fn export_recovery_declines_startup_callbacks_before_any_request() {
    for custom in [false, true] {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let scope_path = helper.scopes.local_path.join(".bit/scope.json");
        let mut scope: Value = serde_json::from_slice(&fs::read(&scope_path).unwrap()).unwrap();
        scope["remotes"] =
            json!({"fixture.one":format!("http://{}", listener.local_addr().unwrap())});
        fs::write(&scope_path, serde_json::to_vec_pretty(&scope).unwrap()).unwrap();
        let config_path = helper.scopes.local_path.join("workspace.jsonc");
        let mut config =
            bit_workspace_config::parse_jsonc(&fs::read(&config_path).unwrap()).unwrap();
        if custom {
            config["fixture.scope/custom-aspect"] = json!({});
        } else {
            config["teambit.workspace/workspace"]["bitmapAutoSync"] = json!(true);
        }
        fs::write(&config_path, serde_json::to_vec_pretty(&config).unwrap()).unwrap();
        let before = fs::read(&scope_path).unwrap();
        let unavailable = helper.scopes.e2e_dir.join("unavailable-node");
        let run = Helper::cmd_in_with(
            &helper.scopes.local_path,
            "resume-export fixture-export fixture.one --delete --force",
            &[("BIT_NODE_BINARY", unavailable.as_os_str())],
        );
        assert!(!run.native, "{run:?}");
        assert_eq!(listener.accept().unwrap_err().kind(), std::io::ErrorKind::WouldBlock);
        assert_eq!(fs::read(&scope_path).unwrap(), before);
    }
}

fn configure(root: &Path, remotes: &[(&Server, &str)]) {
    let scope_path = if root.join("scope.json").is_file() {
        root.join("scope.json")
    } else {
        root.join(".bit/scope.json")
    };
    let mut scope: Value = serde_json::from_slice(&fs::read(&scope_path).unwrap()).unwrap();
    scope["remotes"] = remotes
        .iter()
        .map(|(server, name)| ((*name).to_owned(), json!(server.url)))
        .collect();
    fs::write(scope_path, serde_json::to_vec_pretty(&scope).unwrap()).unwrap();
}

fn compare(helper: &Helper, root: &Path, command: &str) {
    compare_with(helper, root, command, &[]);
}

fn compare_with(helper: &Helper, root: &Path, command: &str, environment: &[(&str, &OsStr)]) {
    let mut node_env = environment.to_vec();
    node_env.push(("BIT_NATIVE", OsStr::new("off")));
    let node = Helper::cmd_in_with(root, command, &node_env);
    let unavailable_node = helper.scopes.e2e_dir.join("unavailable-node");
    let mut native_env = environment.to_vec();
    native_env.push(("BIT_NODE_BINARY", unavailable_node.as_os_str()));
    let native = Helper::cmd_in_with(root, command, &native_env);
    assert!(native.native, "{native:?}");
    assert!(!native.trace.contains("starting the JavaScript host"), "{native:?}");
    assert_eq!(native.stdout, node.stdout, "{native:?}\n{node:?}");
    assert_eq!(native.stderr, node.stderr, "{native:?}\n{node:?}");
    assert_eq!(native.status.code(), node.status.code());
}

fn verify(calls: &[Request], persists: usize) {
    assert_eq!(calls.len(), persists + 1);
    assert_eq!(
        calls[0].body,
        json!({"name":"ExportValidate","options":{"clientId":"fixture-export","isResumingExport":true}}),
    );
    for request in &calls[1..] {
        assert_eq!(
            request.body,
            json!({"name":"ExportPersist","options":{"clientId":"fixture-export"}}),
        );
    }
    assert!(
        calls
            .iter()
            .all(|request| request.path == "/api/scope/action"),
    );
}
