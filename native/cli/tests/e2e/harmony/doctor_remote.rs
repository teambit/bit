//! Actual published remote doctor queries and result rendering match across transports.
mod server;
use crate::helper::{Helper, config};
use serde_json::{Value, json};
use std::{ffi::OsStr, fs, time::Duration};

fn response() -> Value {
    json!({"data":{"scope":{"doctor":{
        "examineResults":[{"diagnosisMetaData":{"name":"validate git exec","description":"validate that git executable found","category":"vendors"},"bareResult":{"valid":true},"formattedSymptoms":"","formattedManualTreat":""}],
        "metaData":{"nodeVersion":"v22.22.0","runningTimestamp":1,"platform":"linux","bitVersion":"2.2.94","npmVersion":"10.9.4","yarnVersion":null,"userDetails":"fixture<fixture@example.test>"}
    }}}})
}
fn http(command: &str, response: &Value) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let server = server::Server::new(response);
    let path = bit_object_import::scope_path(&helper.scopes.local_path).join("scope.json");
    let mut scope = config::read_jsonc(&path);
    scope["remotes"][&helper.scopes.remote] = json!(server.url);
    config::write_json(&path, &scope, b"    ");
    let oracle = helper.clone_workspace();
    let command = command.replace("REMOTE", &helper.scopes.remote);
    let environment = [
        ("BIT_CONFIG_USER_TOKEN", OsStr::new("doctor-fixture-token")),
        ("__CUSTOM_ORIGIN", OsStr::new("doctor-fixture-origin")),
    ];
    let mut expected_environment = environment.to_vec();
    expected_environment.push(("BIT_NATIVE", OsStr::new("off")));
    let expected = Helper::cmd_in_with(&oracle, &command, &expected_environment);
    let actual = Helper::cmd_in_with(&helper.scopes.local_path, &command, &environment);
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(
        actual.status.code(),
        expected.status.code(),
        "{command}: {} {}",
        actual.stderr,
        expected.stderr,
    );
    assert_eq!(actual.stdout, expected.stdout, "{command}");
    assert_eq!(actual.stderr, expected.stderr, "{command}");
    compare_requests(server);
}

#[test]
fn http_remote_doctor_preserves_named_and_complete_results_and_exact_queries() {
    for command in [
        "doctor --remote REMOTE --json",
        "doctor --remote REMOTE",
        r#"doctor "validate git exec" --remote REMOTE --json"#,
    ] {
        http(command, &response());
    }
}
#[test]
fn http_remote_doctor_preserves_unsupported_server_and_missing_diagnosis_errors() {
    http(
        "doctor --remote REMOTE --json",
        &json!({"errors":[{"message":r#"Cannot query field "doctor" on type "Scope"."#}]}),
    );
    let mut empty = response();
    empty["data"]["scope"]["doctor"]["examineResults"] = json!([]);
    http("doctor missing-diagnosis --remote REMOTE --json", &empty);
}
#[test]
fn file_remote_scope_diagnostics_match_the_published_scope_context() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let oracle = helper.clone_workspace();
    let command =
        format!(r#"doctor "validate scope objects" --remote {} --json"#, helper.scopes.remote);
    let expected = Helper::cmd_in_with(&oracle, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.native_run(&command);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(
        fs::read(bit_object_import::scope_path(&helper.scopes.local_path).join("scope.json"))
            .unwrap(),
        fs::read(bit_object_import::scope_path(&oracle).join("scope.json")).unwrap(),
    );
}

fn compare_requests(server: server::Server) {
    let node = server.requests
        .recv_timeout(Duration::from_secs(20))
        .unwrap();
    let rust = server.requests
        .recv_timeout(Duration::from_secs(20))
        .unwrap();
    assert_eq!(rust.body, node.body, "GraphQL request");
    assert_eq!(rust.body["operationName"], "doctor");
    assert_eq!(rust.semantic_headers(), node.semantic_headers(), "GraphQL headers");
    assert_eq!(rust.headers["authorization"], "Bearer doctor-fixture-token");
    assert_eq!(rust.headers["x-verb"], "read");
    server.finish();
}
