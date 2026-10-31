use super::{State, serve};
use serde_json::{Value, json};
use std::io::Cursor;

fn request(input: impl serde::Serialize) -> Value {
    state_request(&mut State::default(), input)
}
fn state_request(state: &mut State, input: impl serde::Serialize) -> Value {
    let bytes = serde_json::to_vec(&input).unwrap();
    let mut frame = 23_u32.to_be_bytes().to_vec();
    frame.extend((bytes.len() as u32).to_be_bytes());
    frame.extend(bytes);
    let mut output = Vec::new();
    serve(&mut Cursor::new(frame), &mut output, state, &super::tests::POOL).unwrap();
    serde_json::from_slice(&output).unwrap()
}
struct Directory(std::path::PathBuf);
impl Directory {
    fn new() -> Self {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let path = std::env::temp_dir()
            .join(format!(
                "bit-config-test-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
            ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn input(&self) -> Value {
        let path = self.0.join("workspace.jsonc");
        let fallback = self.0.join("fallback.jsonc");
        std::fs::write(&path, "{\n  \"pkg\": \"1.0.0\"\n}\n").unwrap();
        std::fs::write(&fallback, "").unwrap();
        json!({"kind":"configWorkspaceConflictPlan","path":path,"fallbackPath":fallback,"conflicts":{"dependencies":[{"name":"pkg","version":"CONFLICT::1.0.0::2.0.0"}]}})
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _cleanup = std::fs::remove_dir_all(&self.0);
    }
}
#[test]
fn jsonc_missing_substring_preflight_preserves_source_and_candidate() {
    let directory = Directory::new();
    let mut input = directory.input();
    input["conflicts"]["dependencies"][0]["name"] = json!("missing");
    let source = std::fs::read(directory.0.join("workspace.jsonc")).unwrap();
    assert_eq!(request(input)["failed"], true);
    assert_eq!(std::fs::read(directory.0.join("workspace.jsonc")).unwrap(), source);
    assert!(std::fs::read(directory.0.join("fallback.jsonc")).unwrap().is_empty());
}
#[test]
fn jsonc_private_candidate_plan_is_portable_and_does_not_write_workspace() {
    use sha1::Digest;
    let directory = Directory::new();
    let input = directory.input();
    let source = std::fs::read(directory.0.join("workspace.jsonc")).unwrap();
    let response = request(input);
    assert_eq!(response["failed"], false);
    assert_eq!(response["completed"], 1);
    assert_eq!(std::fs::read(directory.0.join("workspace.jsonc")).unwrap(), source);
    let candidate = std::fs::read(directory.0.join("fallback.jsonc")).unwrap();
    let text = String::from_utf8(candidate.clone()).unwrap();
    assert!(text.contains("<<<<<<< ours"));
    assert!(text.contains(">>>>>>> theirs"));
    assert!(text.contains("1.0.0"));
    assert!(text.contains("2.0.0"));
    assert_eq!(response["data"]["bytes"], candidate.len());
    assert_eq!(
        response["data"]["sha1"],
        crate::validate::hexadecimal(&sha1::Sha1::digest(&candidate)),
    );
}
#[test]
fn nonempty_private_candidate_declines_without_mutation() {
    let directory = Directory::new();
    let input = directory.input();
    let source = std::fs::read(directory.0.join("workspace.jsonc")).unwrap();
    std::fs::write(directory.0.join("fallback.jsonc"), "keep").unwrap();
    assert_eq!(request(input)["failed"], true);
    assert_eq!(std::fs::read(directory.0.join("workspace.jsonc")).unwrap(), source);
    assert_eq!(std::fs::read(directory.0.join("fallback.jsonc")).unwrap(), b"keep");
}

#[cfg(windows)]
#[test]
fn windows_owned_candidate_recreation_keeps_hardlink_alias_and_public_target_untouched() {
    let directory = Directory::new();
    let input = directory.input();
    std::fs::hard_link(directory.0.join("fallback.jsonc"), directory.0.join("empty-alias"))
        .unwrap();
    let source = std::fs::read(directory.0.join("workspace.jsonc")).unwrap();
    let mut state = State::default();
    let response = state_request(&mut state, input);
    assert_eq!(response["failed"], false);
    assert!(std::fs::read(directory.0.join("empty-alias")).unwrap().is_empty());
    let candidate = std::fs::read(directory.0.join("fallback.jsonc")).unwrap();
    assert!(!candidate.is_empty());
    let path = directory.0.join("workspace.jsonc");
    let public_alias = directory.0.join("public-alias");
    std::fs::hard_link(&path, &public_alias).unwrap();
    let commit = json!({"kind":"configWorkspaceConflictCommit","path":path,"token":response["data"]["token"]});
    assert_eq!(state_request(&mut state, &commit)["failed"], true);
    assert_eq!(std::fs::read(&path).unwrap(), source);
    assert_eq!(std::fs::read(&public_alias).unwrap(), source);
    assert_eq!(std::fs::read(directory.0.join("fallback.jsonc")).unwrap(), candidate);
    std::fs::remove_file(public_alias).unwrap();
    let original = std::fs::File::open(&path).unwrap();
    let before = winapi_util::file::information(&original).unwrap();
    assert_eq!(state_request(&mut state, &commit)["data"], json!({"saved":true}));
    let after = winapi_util::file::information(&std::fs::File::open(&path).unwrap()).unwrap();
    assert_eq!(before.volume_serial_number(), after.volume_serial_number());
    assert_eq!(before.file_index(), after.file_index());
    assert_eq!(std::fs::read(&path).unwrap(), candidate);
    assert!(std::fs::read(directory.0.join("empty-alias")).unwrap().is_empty());
    assert_eq!(std::fs::read(directory.0.join("fallback.jsonc")).unwrap(), candidate);
    assert_eq!(state_request(&mut state, commit)["failed"], true);
}

#[cfg(unix)]
#[test]
fn jsonc_plan_commit_is_owned_and_consumes_successful_token() {
    use sha1::Digest;
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let directory = Directory::new();
    let input = directory.input();
    let path = directory.0.join("workspace.jsonc");
    let original = std::fs::read(&path).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o640)).unwrap();
    let before = std::fs::metadata(&path).unwrap();
    let mut state = State::default();
    let response = state_request(&mut state, input);
    assert_eq!(response["failed"], false);
    assert_eq!(std::fs::read(&path).unwrap(), original);
    let candidate = std::fs::read(directory.0.join("fallback.jsonc")).unwrap();
    assert!(String::from_utf8_lossy(&candidate).contains("<<<<<<< ours"));
    assert_eq!(response["data"]["bytes"], candidate.len());
    assert_eq!(
        response["data"]["sha1"],
        crate::validate::hexadecimal(&sha1::Sha1::digest(&candidate)),
    );
    let mut commit = json!({"kind":"configWorkspaceConflictCommit","path":path,"token":"invalid"});
    assert_eq!(state_request(&mut state, &commit)["failed"], true);
    commit["token"] = response["data"]["token"].clone();
    assert_eq!(state_request(&mut state, &commit)["data"], json!({"saved":true}));
    assert_eq!(std::fs::read(&path).unwrap(), candidate);
    let after = std::fs::metadata(&path).unwrap();
    assert_eq!(before.ino(), after.ino());
    assert_eq!(after.permissions().mode() & 0o777, 0o640);
    assert_eq!(state_request(&mut state, commit)["failed"], true);
}
fn version(major: u32, prerelease: Value) -> Value {
    {
        let mut version = json!({"major":major,"minor":0,"patch":0});
        version["prerelease"] = prerelease;
        version
    }
}
fn updates() -> Value {
    json!({"kind":"configWorkspaceUpdates","workspaceEntries":[{"dependencyId":"pkg","lifecycleType":"runtime","value":{"version":"1.0.0"}}],
        "componentDeps":[{"name":"pkg","versions":["2.0.0"]}],"semver":{"1.0.0":{"version":version(1,json!([]))},"2.0.0":{"version":version(2,json!([]))}}})
}
#[test]
fn workspace_upgrade_conflicts_and_theirs_updates() {
    let input = updates();
    let response = request(input.clone());
    assert_eq!(
        response["data"]["conflicts"],
        json!({"dependencies":[{"name":"pkg","version":"CONFLICT::1.0.0::2.0.0"}]}),
    );
    let mut input = input;
    input["strategy"] = json!("theirs");
    assert_eq!(request(input)["data"]["updates"], json!([["pkg", "1.0.0", "2.0.0"]]));
}
#[test]
fn multiple_component_versions_skip_without_logs() {
    let mut input = updates();
    input["componentDeps"][0]["versions"] = json!(["2.0.0", "3.0.0"]);
    let response = request(input);
    assert_eq!(response["data"]["hasDeps"], false);
    assert_eq!(response["data"]["logs"], json!([]));
}
#[test]
fn workspace_lifecycle_uses_first_entry_but_version_uses_last() {
    let mut input = updates();
    input["workspaceEntries"][0]["lifecycleType"] = json!("peer");
    input["workspaceEntries"]
        .as_array_mut()
        .unwrap()
        .push(json!({"dependencyId":"pkg","lifecycleType":"runtime","value":{"version":"1.0.0"}}));
    assert!(request(input)["data"]["conflicts"].get("peerDependencies").is_some());
}
fn workspace() -> Value {
    json!({"kind":"configWorkspaceMerge","records":[{"compId":"one","mergedPolicy":{"dependencies":[{"name":"pkg","version":"2.0.0","force":false}]}},{"compId":"two","mergedPolicy":{"devDependencies":[{"name":"pkg","version":"2.0.0"}]}}],"policy":{"dependencies":{"pkg":"1.0.0"},"devDependencies":{"pkg":"0.0.0"}},"semver":{}})
}
#[test]
fn aggregation_updates_each_lifecycle_and_last_tuple_wins() {
    let response = request(workspace());
    assert_eq!(
        response["data"]["changes"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    assert_eq!(response["data"]["updates"], json!([["pkg", "0.0.0", "2.0.0"]]));
    assert_eq!(
        response["data"]["debug"][0],
        "update workspace.jsonc: pkg from 1.0.0 to 2.0.0. Triggered by: one, two",
    );
}
#[test]
fn aggregation_multiple_versions_preserves_diagnostic_order() {
    let mut input = workspace();
    input["records"][1]["mergedPolicy"]["devDependencies"][0]["version"] = json!("3.0.0");
    assert_eq!(
        request(input)["data"]["unchanged"],
        json!([["pkg", "multiple versions found. 2.0.0 (by one), 3.0.0 (by two)"]]),
    );
}
fn extension(name: &str, config: Value, data: Value) -> Value {
    {
        let mut entry = json!({"name":name,"stringId":name,"idWithoutVersion":name,"configJson":serde_json::to_string(&config).unwrap(),"configPretty":serde_json::to_string_pretty(&config).unwrap()});
        entry["config"] = config;
        entry["data"] = data;
        entry
    }
}
fn component() -> Value {
    let env = extension("teambit.envs/envs", json!({"env":"teambit.node/node"}), json!({}));
    json!({"kind":"configComponent","compIdStr":"scope/comp","current":[env],"other":[env],"base":[env],"coreNames":["teambit.envs/envs","example/aspect"],"workspaceIds":[],"otherLaneIds":[],"currentLabel":"ours","otherLabel":"theirs","semver":{},"shouldMergeAspectsData":true})
}
#[test]
fn generic_config_preserves_selectors_and_data_assignments() {
    let mut input = component();
    for (side, config, data) in [
        ("current", json!({"key":"base"}), json!({"old":true})),
        ("base", json!({"key":"base"}), json!({"old":true})),
        ("other", json!({"key":"new"}), json!({"new":true})),
    ] {
        input[side]
            .as_array_mut()
            .unwrap()
            .push(extension("example/aspect", config, data));
    }
    let response = request(input);
    assert_eq!(response["failed"], false);
    assert_eq!(
        response["data"]["configRows"],
        json!([{"id":"example/aspect","merged":{"source":{"side":"other","index":1}}}]),
    );
    assert_eq!(response["data"]["dataAssignments"], json!([{"current":1,"other":1}]));
}
#[test]
fn malformed_extension_body_declines_without_panicking() {
    let mut input = component();
    input["current"][0]["data"] = json!({"dependencies":[false]});
    assert_eq!(request(input)["failed"], true);
}
#[test]
fn generic_config_order_comparison_uses_exact_json_projection() {
    let mut input = component();
    let mut left = extension("example/aspect", json!({"first":1,"second":2}), json!({}));
    left["configJson"] = json!(r#"{"first":1,"second":2}"#);
    let mut right = left.clone();
    right["configJson"] = json!(r#"{"second":2,"first":1}"#);
    input["current"]
        .as_array_mut()
        .unwrap()
        .push(left);
    input["other"]
        .as_array_mut()
        .unwrap()
        .push(right);
    assert_eq!(request(input)["data"]["configRows"][0]["conflict"]["kind"], "basic");
}
#[test]
fn scope_rescue_preserves_deletion_and_duplicate_original_selectors() {
    let input = json!({"kind":"configScopePolicy","merged":[{"field":"dependencies","entries":[{"name":"deleted","version":"-"},{"name":"pkg","version":"1"},{"name":"pkg","version":"2"}]}],"scope":[{"field":"dependencies","entries":[{"name":"deleted","version":"3"},{"name":"pkg","version":"4"},{"name":"rescued","version":"5"}]}]});
    let response = request(input);
    assert_eq!(
        response["data"],
        json!({"appendOrder":["dependencies"],"fields":[{"field":"dependencies","append":[{"name":"rescued","version":"5","force":true}],"retain":[{"original":1},{"original":2},{"appended":0}],"delete":false}]}),
    );
}
#[test]
fn scope_append_order_precedes_final_policy_filter_order() {
    let input = json!({"kind":"configScopePolicy","merged":[{"field":"dependencies","entries":[]},{"field":"devDependencies","entries":[]}],"scope":[{"field":"devDependencies","entries":[{"name":"dev","version":"1"}]},{"field":"dependencies","entries":[{"name":"runtime","version":"2"}]}]});
    let response = request(input);
    assert_eq!(response["data"]["appendOrder"], json!(["devDependencies", "dependencies"]));
    assert_eq!(response["data"]["fields"][0]["field"], "dependencies");
    assert_eq!(response["data"]["fields"][1]["field"], "devDependencies");
}
#[test]
fn scope_new_empty_fields_and_absent_scope_filter_without_rescue() {
    let response = request(
        json!({"kind":"configScopePolicy","merged":[{"field":"dependencies","entries":[{"name":"deleted","version":"-"}]}],"scope":[{"field":"peerDependencies","entries":[]}]}),
    );
    assert_eq!(
        response["data"]["fields"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    assert_eq!(
        response["data"]["fields"][1],
        json!({"field":"peerDependencies","append":[],"retain":[],"delete":true}),
    );
    let response = request(
        json!({"kind":"configScopePolicy","merged":[{"field":"dependencies","entries":[{"name":"pkg","version":"1"}]}]}),
    );
    assert_eq!(response["data"]["fields"][0]["retain"], json!([{"original":0}]));
    assert_eq!(response["data"]["appendOrder"], json!([]));
}
#[test]
fn scope_raw_deletion_append_remains_visible_in_original_array_phase() {
    let response = request(
        json!({"kind":"configScopePolicy","merged":[{"field":"dependencies","entries":[]}],"scope":[{"field":"dependencies","entries":[{"name":"pkg","version":"-"}]}]}),
    );
    assert_eq!(
        response["data"]["fields"][0]["append"],
        json!([{"name":"pkg","version":"-","force":true}]),
    );
    assert_eq!(response["data"]["fields"][0]["delete"], true);
}
#[test]
fn scope_duplicate_field_metadata_declines_whole_request() {
    let response = request(
        json!({"kind":"configScopePolicy","merged":[{"field":"dependencies","entries":[]},{"field":"dependencies","entries":[]}],"scope":[]}),
    );
    assert_eq!(response["failed"], true);
    assert!(response.get("data").is_none());
}
#[test]
fn component_state_hydration_retains_lookup_indices_without_affecting_env_equality() {
    let mut input = component();
    input["coreNames"]
        .as_array_mut()
        .unwrap()
        .push(json!("teambit.node/node"));
    for side in ["current", "other", "base"] {
        if side == "other" {
            input[side]
                .as_array_mut()
                .unwrap()
                .push(extension("example/aspect", json!({}), json!({})));
        }
        input[side]
            .as_array_mut()
            .unwrap()
            .push(extension("teambit.node/node", json!({"options":true}), json!({})));
    }
    let response = request(input);
    assert_eq!(response["failed"], false);
    assert_eq!(
        response["data"]["state"]["envs"],
        json!([{"id":"teambit.node/node","sourceIndex":1},{"id":"teambit.node/node","sourceIndex":2},{"id":"teambit.node/node","sourceIndex":1}]),
    );
    assert_eq!(
        response["data"]["state"]["handledExtIds"],
        json!([
            "teambit.pipelines/builder",
            "teambit.envs/envs",
            "teambit.node/node",
            "teambit.node/node",
            "example/aspect"
        ]),
    );
    assert!(
        !response["data"]["configRows"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["id"] == "teambit.envs/envs"),
    );
}
