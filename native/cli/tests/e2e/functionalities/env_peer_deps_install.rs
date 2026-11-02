//! Port of `e2e/functionalities/env-peer-deps-install.e2e.ts` for environment peer dependency installation ([`create_react_and_check_types`]).
//!
//! Verifies that creating a React component installs `@types/react` and passes `bit check-types`.

use crate::helper::Helper;

/// Command line used to scaffold a React `button` component when testing peer dependency installation.
const CREATE_REACT_BUTTON: &str = "create react button";

/// Verifies that [`CREATE_REACT_BUTTON`] installs environment peer dependencies (`@types/react`) so `bit check-types` succeeds ([`Helper`]).
#[test]
fn create_react_and_check_types() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.run(CREATE_REACT_BUTTON);
    assert!(helper.scopes.local_path.join("node_modules/@types/react").is_dir());
    let check = helper.native_run("check-types");
    assert_eq!(check.status.code(), Some(0));
}
