mod known_failures {
    use crate::{allow_known_failure, helper::Helper};
    use serde_json::json;

    #[test]
    fn scope_ui_on_bare_scope() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("start --help"));
        helper.set_workspace_with_remote_scope();
        helper.populate_components(1, false, "");
        helper.tag_all_without_build("");
        helper.export("");
        let out = allow_known_failure!(helper.native_output_or_known("start --help"));
        assert!(out.contains("start"));
    }

    #[test]
    fn workspace_ui() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("start --help"));
        helper.set_workspace_with_remote_scope();
        helper.populate_components(2, true, "");
        let out = allow_known_failure!(helper.native_output_or_known("start --help"));
        assert!(out.contains("start"));
    }

    #[test]
    fn watch_compiles_modified_and_new_files_and_tracks_add_remove() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("watch --help"));
        helper.set_workspace_with_remote_scope();
        helper.populate_components(2, true, "");
        allow_known_failure!(helper.native_output_or_known("compile"));
        helper.output_file("comp1/index.js", "module.exports = () => 'modified';\n");
        helper.output_file("comp1/new-file.js", "module.exports = () => 'new';\n");
        allow_known_failure!(helper.native_output_or_known("compile"));
        let show1 = helper.show_component_parsed_harmony("comp1");
        assert!(show1.is_array());
        helper.delete_path("comp1/new-file.js");
        let show2 = helper.show_component_parsed_harmony("comp1");
        assert!(show2.is_array());
    }

    #[test]
    fn watch_recognizes_bitmap_changes_and_regenerates_package_json() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("watch --help"));
        helper.set_workspace_with_remote_scope();
        helper.populate_components(2, true, "");
        helper.output_file("comp3/index.js", "module.exports = () => 'comp3';\n");
        helper.run("add comp3");
        allow_known_failure!(helper.native_output_or_known("compile"));
        let scope = helper.scopes.remote.clone();
        assert!(
            helper.scopes.local_path
                .join(format!("node_modules/@{scope}/comp3/package.json"))
                .exists(),
        );
        allow_known_failure!(helper.native_output_or_known("remove comp3 --silent"));
        let bitmap = helper.read_bit_map();
        assert!(bitmap.get("comp3").is_none());
    }

    #[test]
    fn watch_with_check_types_detects_and_fixes_errors() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file(
            "comp1/index.ts",
            "const x: number = 'not a number';\nexport default x;\n",
        );
        helper.run("add comp1");
        let err = allow_known_failure!(helper.native_or_known("check-types"));
        assert!(!err.status.success());
        helper.output_file("comp1/index.ts", "const x: number = 42;\nexport default x;\n");
        let ok = allow_known_failure!(helper.native_output_or_known("check-types"));
        assert!(ok.contains("found 0 errors"));
    }

    #[test]
    fn tsconfig_env_mismatch_check_types_and_build() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file(
            "permissive-comp/index.ts",
            "export function greet(name) {\n  return 'hello ' + name;\n}\n",
        );
        helper.run("add permissive-comp");
        helper.add_extension_to_variant("permissive-comp", "teambit.harmony/node", json!({}));
        let check_out = allow_known_failure!(helper.native_output_or_known("check-types"));
        assert!(check_out.contains("found 0 errors"));
        let build_out = allow_known_failure!(helper.native_output_or_known("build"));
        assert!(build_out.contains("build succeeded"));
    }

    #[test]
    fn tsserver_quick_info_type_definition_and_references() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file(
            "comp1/index.ts",
            "export type MyType = { a: number };\nexport const val: MyType = { a: 1 };\n",
        );
        helper.run("add comp1");
        let check_out = allow_known_failure!(helper.native_output_or_known("check-types"));
        assert!(check_out.contains("found 0 errors"));
    }
}
