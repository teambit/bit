//! `e2e/functionalities/env-peer-deps-install.e2e.ts`.

use crate::helper::Helper;

/// - `env peer dependencies should be installed for created components › bit create react and then check-types › should install env peer deps like @types/react in node_modules`
/// - `env peer dependencies should be installed for created components › bit create react and then check-types › bit check-types should pass without errors`
#[test]
fn create_react_and_check_types() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.run("create react button");
    assert!(helper.scopes.local_path.join("node_modules/@types/react").is_dir());
    let check = helper.native_run("check-types");
    assert_eq!(check.status.code(), Some(0));
}
