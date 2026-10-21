//! `e2e/harmony/lanes/lane-eject.e2e.ts`.

mod known_failures {
    use crate::{allow_known_failure, helper::Helper};

    /// - `bit lane command › eject components with dependencies after export › eject with the default options › should indicate that the eject was successful`
    /// - `bit lane command › eject components with dependencies after export › eject with the default options › should save the component in workspace.jsonc`
    /// - `bit lane command › eject components with dependencies after export › eject with the default options › should mark the component as deleted on the lane`
    /// - `bit lane command › eject components with dependencies after export › eject with the default options › should have the component files as a package (in node_modules)`
    /// - `bit lane command › eject components with dependencies after export › eject with the default options › should delete the original component files from the file-system`
    /// - `bit lane command › eject components with dependencies after export › eject with the default options › bit status should show no issues`
    /// - `bit lane command › eject components with dependencies after export › eject with the default options › should not delete the objects from the scope`
    /// - `bit lane command › eject when there is no main version › should throw an error saying it has no main version`
    #[test]
    fn lane_eject_when_no_main_version() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.populate_components(1, true, "");
        helper.create_lane("dev", "");
        helper.snap_all_components_without_build("");
        helper.export("");

        let run = allow_known_failure!(helper.native_or_known("lane eject comp1"));
        assert_ne!(run.status.code(), Some(0));
        let combined = format!("{}\n{}", run.stdout, run.stderr);
        assert!(combined.contains("it has no main version"), "{combined}");
    }
}
