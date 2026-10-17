//! Complete central-export commands use the released parser and server publication path.
pub(super) mod comparison;
#[cfg(unix)]
mod interrupt;
use crate::helper::{Helper, config, setup};
use serde_json::{Value, json};
use std::{
    ffi::OsStr,
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
};

struct Hub {
    child: Child,
    url: String,
    journal: PathBuf,
    ci: bool,
}
impl Hub {
    fn start(helper: &Helper, mode: &str) -> Self {
        let shared = setup::shared();
        let configuration = helper.scopes.e2e_dir.join("hub.json");
        let journal = helper.scopes.e2e_dir.join("requests.jsonl");
        fs::write(
            &configuration,
            json!({"scopes":{&helper.scopes.remote:helper.scopes.remote_path},"mode":mode})
                .to_string(),
        )
        .unwrap();
        let mut child = Command::new("node")
            .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/e2e/harmony/export_hub/server.cjs"))
            .args([shared.node_cli.as_os_str(), configuration.as_os_str(), journal.as_os_str()])
            .env("HOME", shared.root.join("home"))
            .env("USERPROFILE", shared.root.join("home"))
            .env("BIT_GLOBALS_DIR", shared.root.join("globals"))
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let mut port = String::new();
        BufReader::new(child.stdout.take().unwrap()).read_line(&mut port).unwrap();
        assert!(!port.trim().is_empty());
        Self {
            child,
            url: format!("http://127.0.0.1:{}", port.trim()),
            journal,
            ci: !matches!(mode, "failure" | "direct-failure" | "direct-multi-failure"),
        }
    }
    fn run(&self, root: &Path, command: &str, node: bool) -> crate::helper::Run {
        let mut environment = vec![
            ("BIT_NATIVE", OsStr::new(if node { "off" } else { "on" })),
            ("BIT_CONFIG_SYMPHONY_URL", OsStr::new(&self.url)),
            ("BIT_CONFIG_USER_TOKEN", OsStr::new("fixture-token")),
            ("__CUSTOM_ORIGIN", OsStr::new("fixture-hub")),
        ];
        if self.ci {
            environment.push(("CI", OsStr::new("1")));
        }
        Helper::cmd_in_with(root, command, &environment)
    }
    fn requests(&self) -> Vec<Value> {
        fs::read_to_string(&self.journal)
            .unwrap()
            .split_inclusive('\n')
            .filter(|line| line.ends_with('\n'))
            .map(|line| serde_json::from_str(line).unwrap())
            .collect()
    }
}
impl Drop for Hub {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn pending(lane: bool, mode: &str) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'hub';\n");
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message hub");
    second_component(&helper, mode);
    if lane {
        helper.run("lane create dev");
        helper.run("snap --unmodified --message lane");
    }
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope.remove("remotes");
    });
    if mode == "mixed" {
        direct_scope(&helper);
    }
    helper
}

fn parity(lane: bool, mode: &str) {
    let helper = pending(lane, mode);
    if mode == "jobs-failure" {
        fs::create_dir(helper.scopes.local_path.join(".bit/last-export.json")).unwrap();
    }
    let hub = Hub::start(&helper, mode);
    if mode.starts_with("direct") {
        configure_direct(&helper, &hub, mode);
    }
    let oracle = helper.clone_workspace();
    let backup = helper.clone_remote_scope();
    let expected = hub.run(&oracle, "export --verbose", true);
    assert_eq!(
        expected.status.success(),
        !matches!(
            mode,
            "failure" | "failure-ci" | "mixed" | "direct-failure" | "direct-multi-failure"
        ),
        "{} {} requests:{:?}",
        expected.stdout,
        expected.stderr,
        hub.requests(),
    );
    let expected_remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&backup);
    let actual = hub.run(&helper.scopes.local_path, "export --verbose", false);
    if mode == "failure-ci" {
        comparison::ci_failure(&actual, &expected);
    } else {
        comparison::runs(&actual, &expected, &hub.requests(), mode != "mixed");
    }
    comparison::controls(&helper.scopes.local_path, &oracle);
    comparison::remote_objects(&helper.scopes.remote_path, &expected_remote);
    comparison::protocol(&hub.requests(), mode, &helper.scopes.remote);
}

#[test]
fn main_export_through_central_hub_matches_node() {
    parity(false, "complete");
}
#[test]
fn lane_export_through_central_hub_matches_node() {
    parity(true, "complete");
}

#[test]
fn central_persistence_failure_preserves_local_pending_state_like_node() {
    parity(false, "failure");
}

#[test]
fn central_acknowledges_only_returned_component_ids_like_node() {
    parity(false, "subset");
}

#[test]
fn mixing_central_and_direct_scopes_rejects_before_upload_like_node() {
    parity(false, "mixed");
}

fn second_component(helper: &Helper, mode: &str) {
    if matches!(mode, "subset" | "mixed" | "direct-multi-failure") {
        if mode != "subset" {
            config::set_workspace_key(
                &helper.scopes.local_path,
                "teambit.workspace/variants",
                json!({"second":{"defaultScope":format!("{}-direct",helper.scopes.remote)}}),
            );
        }
        helper.output_file("second/index.js", "module.exports = 2;\n");
        helper.run("add second --id bar/second");
        helper.run("tag bar/second --message second");
    }
}

fn direct_scope(helper: &Helper) {
    let direct = format!("{}-direct", helper.scopes.remote);
    let remote = helper.scopes.e2e_dir.join(&direct);
    setup::copy_dir(&setup::shared().bare_scope_template, &remote);
    config::update_scope_json(&remote.join("scope.json"), |scope| {
        scope.insert("name".into(), json!(direct));
    });
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope.insert("remotes".into(), json!({direct:format!("file://{}",remote.display())}));
    });
}

#[test]
fn central_retry_preserves_uuid_hash_and_objects_like_node() {
    parity(false, "retry");
}

#[test]
fn ci_central_failure_retains_primary_error_and_native_ownership() {
    parity(false, "failure-ci");
}

#[test]
fn central_main_jobs_urls_and_last_export_match_node() {
    parity(false, "jobs");
}
#[test]
fn central_lane_jobs_urls_and_last_export_match_node() {
    parity(true, "jobs");
}
#[test]
fn last_export_metadata_write_failure_is_nonfatal_like_node() {
    parity(false, "jobs-failure");
}

fn configure_direct(helper: &Helper, hub: &Hub, mode: &str) {
    let mut remotes = serde_json::Map::new();
    remotes.insert(
        helper.scopes.remote.clone(),
        json!(format!("{}/{}", hub.url, helper.scopes.remote)),
    );
    if mode == "direct-multi-failure" {
        let second = format!("{}-direct", helper.scopes.remote);
        remotes.insert(second.clone(), json!(format!("{}/{second}", hub.url)));
    }
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope.insert("remotes".into(), remotes.into());
    });
}
#[test]
fn direct_http_push_failure_retains_exact_attempted_prefix() {
    parity(false, "direct-failure");
}
#[test]
fn first_direct_scope_failure_does_not_attempt_second_scope_or_validation() {
    parity(false, "direct-multi-failure");
}
