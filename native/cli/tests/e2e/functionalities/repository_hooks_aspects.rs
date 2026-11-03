//! Port of `e2e/functionalities/repository-hooks-aspects.e2e.ts` for aspect repository hooks ([`repository_hooks_aspect_use_and_tag`]).
//!
//! Verifies registering a repository-hooks aspect ([`REPOSITORY_HOOKS_ASPECT_NAME`]) in `workspace.jsonc` via native `bit use`.

use crate::helper::Helper;

/// Component name for the fixture aspect used in `bit use` repository-hooks tests.
const REPOSITORY_HOOKS_ASPECT_NAME: &str = "repository-hooks-aspect";

/// Verifies registering [`REPOSITORY_HOOKS_ASPECT_NAME`] in `workspace.jsonc` via native `bit use` ([`Helper`]) and reading it back.
#[test]
fn repository_hooks_aspect_use_and_tag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_aspect(REPOSITORY_HOOKS_ASPECT_NAME);
    let aspect_id = format!("{}/{REPOSITORY_HOOKS_ASPECT_NAME}", helper.scopes.remote);
    let use_out = helper.native(&format!("use {aspect_id}"));
    assert!(use_out.contains(&aspect_id), "{use_out}");
    let ws = helper.read_workspace_jsonc();
    assert!(ws.get(&aspect_id).is_some(), "{ws}");
}
