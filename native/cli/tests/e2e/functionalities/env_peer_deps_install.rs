//! `e2e/functionalities/env-peer-deps-install.e2e.ts`.

mod known_failures {
    use crate::{allow_known_failure, helper::Helper};

    /// - `env peer dependencies should be installed for created components › bit create react and then check-types › should install env peer deps like @types/react in node_modules`
    /// - `env peer dependencies should be installed for created components › bit create react and then check-types › bit check-types should pass without errors`
    #[test]
    fn create_react_and_check_types() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let run = allow_known_failure!(helper.native_or_known("create react button"));
        assert_eq!(run.status.code(), Some(0));
        assert!(helper.scopes.local_path.join("node_modules/@types/react").is_dir());
        let check = allow_known_failure!(helper.native_or_known("check-types"));
        assert_eq!(check.status.code(), Some(0));
    }
}
