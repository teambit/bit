//! The original peer `+` assertion excludes resolver errors, not all installation failures ([`patterned_lane_import_resolves_peer_plus_before_graceful_unpublished_peer_failure`]).
//!
//! Verifies patterned `bit lane import` resolves `+` peer versions to `*` before installation.

use super::{empty, lane};
use crate::{
    commands::move_paths::support,
    helper::{config, remote},
};
use serde_json::json;

/// Custom environment component directory and ID used in the peer `+` resolution fixture.
const EMPTY_ENV_ID: &str = "empty-env";

/// Verifies that patterned `bit lane import -p` resolves `+` peer versions before handling unpublished peer errors.
#[test]
fn patterned_lane_import_resolves_peer_plus_before_graceful_unpublished_peer_failure() {
    let helper = support::workspace(2, false);
    helper.output_file(
        "empty-env/empty-env.bit-env.ts",
        "export class EmptyEnv {}\nexport default new EmptyEnv();\n",
    );
    helper.output_file("empty-env/index.ts", "export { EmptyEnv } from './empty-env.bit-env';\n");
    support::setup(&helper, &format!("add {EMPTY_ENV_ID}"));
    config::set_component_env(&helper.scopes.local_path, EMPTY_ENV_ID, "teambit.envs/env");
    helper.output_file(
        "empty-env/env.jsonc",
        &json!({"policy":{"peers":[{
            "name":format!("@{}/comp1",helper.scopes.remote),
            "version":"+","supportedRange":"^0.0.1"
        }]}})
        .to_string(),
    );
    support::setup(&helper, "env set comp2 empty-env");
    support::setup(&helper, "lane create dev");
    support::setup(&helper, "snap --ignore-issues * --message lane");
    remote::publish(&helper);
    empty(&helper);
    let command = format!("lane import {} -p {}/comp2", lane(&helper), helper.scopes.remote);
    let output = support::compare_with_stdout(&helper, &command, super::output::durations);
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    assert!(!output.stdout.contains("isn't supported by any available resolver"));
    assert!(!output.stdout.contains("@+"));
    assert!(output.stdout.contains("Installation Error"), "{}", output.stdout);
    assert!(output.stdout.contains("Not Found - 404"), "{}", output.stdout);
    assert!(output.stdout.contains("/comp1@*"), "{}", output.stdout);
    assert!(support::bitmap(&helper).get("comp2").is_some());
}
