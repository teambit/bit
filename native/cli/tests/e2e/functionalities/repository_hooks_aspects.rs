//! Port of `e2e/functionalities/repository-hooks-aspects.e2e.ts` for aspect repository hooks ([`repository_hooks_aspect_use_and_tag`]).
//!
//! Verifies registering a repository-hooks aspect in `workspace.jsonc` via native `bit use`.

use crate::helper::Helper;

/// Verifies registering a repository-hooks aspect in `workspace.jsonc` via native `bit use`.
#[test]
fn repository_hooks_aspect_use_and_tag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_aspect("repository-hooks-aspect");
    let aspect_id = format!("{}/repository-hooks-aspect", helper.scopes.remote);
    let use_out = helper.native(&format!("use {aspect_id}"));
    assert!(use_out.contains(&aspect_id), "{use_out}");
    let ws = helper.read_workspace_jsonc();
    assert!(ws.get(&aspect_id).is_some(), "{ws}");
}
