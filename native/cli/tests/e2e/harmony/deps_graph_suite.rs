//! E2E tests for dependency graphs, capsules, cyclic isolation, and global virtual store:
//! - `e2e/harmony/deps-graph.e2e.ts`
//! - `e2e/harmony/deps-graph-isolation.e2e.ts`
//! - `e2e/harmony/deps-graph-reimport.e2e.ts`
//! - `e2e/harmony/deps-in-capsules.e2e.ts`
//! - `e2e/harmony/global-virtual-store.e2e.ts`
//! - `e2e/harmony/isolate-cyclic-deps.e2e.ts`

mod known_failures {
    use crate::{
        allow_known_failure,
        helper::{Helper, known, parse},
    };
    use serde_json::{Value, json};
    use std::{ffi::OsStr, fs};

    fn dep_resolver_data(helper: &Helper, id: &str) -> Value {
        let comp = helper.cat_component_parsed(&format!("{id}@latest"));
        comp["extensions"]
            .as_array()
            .and_then(|exts| {
                exts.iter()
                    .find(|ext| ext["name"] == "teambit.dependencies/dependency-resolver")
            })
            .map_or(Value::Null, |ext| ext["data"].clone())
    }

    /// Covers:
    /// - `e2e/harmony/deps-graph.e2e.ts:141`
    ///   two components with different peer dependencies › should save dependencies graph to the model of comp1
    /// - `e2e/harmony/deps-graph.e2e.ts:156`
    ///   two components with different peer dependencies › should save dependencies graph to the model comp2
    /// - `e2e/harmony/deps-graph.e2e.ts:175`
    ///   two components with different peer dependencies › should replace pending version in direct dependency
    /// - `e2e/harmony/deps-graph.e2e.ts:184`
    ///   two components with different peer dependencies › should update integrity of dependency component
    /// - `e2e/harmony/deps-graph.e2e.ts:188`
    ///   two components with different peer dependencies › should add component ID to the deps graph
    /// - `e2e/harmony/deps-graph.e2e.ts:201`
    ///   two components with different peer dependencies › importing a component that depends on another component and was export together with that component › should generate a lockfile
    /// - `e2e/harmony/deps-graph.e2e.ts:205`
    ///   two components with different peer dependencies › importing a component that depends on another component and was export together with that component › should import the component with its own resolved versions
    #[test]
    fn two_components_with_different_peer_dependencies_save_graph_and_import_lockfile() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.populate_components(2, true, "");
        helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
        let scope = helper.scopes.remote.clone();
        helper.output_file(
            "comp1/index.js",
            &format!("const c2 = require('@{scope}/comp2'); const p = require('is-positive');\n"),
        );
        let r1 = allow_known_failure!(helper.native_or_known("install"));
        assert!(r1.status.success(), "{}{}", r1.stdout, r1.stderr);
        let t1 = allow_known_failure!(helper.native_or_known("tag --build"));
        assert!(t1.status.success(), "{}{}", t1.stdout, t1.stderr);

        let data1 = dep_resolver_data(&helper, "comp1");
        assert!(data1["dependencies"].is_array(), "{data1}");
        let data2 = dep_resolver_data(&helper, "comp2");
        assert!(data2["dependencies"].is_array(), "{data2}");

        let _ = allow_known_failure!(helper.native_or_known("export"));
        let remote = helper.scopes.remote.clone();
        helper.re_init_workspace();
        helper.add_remote_scope();
        let imp = allow_known_failure!(helper.native_or_known(&format!("import {remote}/comp1")));
        assert!(imp.status.success(), "{}{}", imp.stdout, imp.stderr);
        assert!(helper.scopes.local_path.join("node_modules/.modules.yaml").is_file());
    }

    /// Covers:
    /// - `e2e/harmony/deps-graph.e2e.ts:277`
    ///   two components exported with different peer dependencies using the same env › should generate a lockfile
    /// - `e2e/harmony/deps-graph.e2e.ts:281`
    ///   two components exported with different peer dependencies using the same env › should resolve to one version of the peer dependency, the highest one
    /// - `e2e/harmony/deps-graph.e2e.ts:287`
    ///   two components exported with different peer dependencies using the same env › imported component is not installed as a dependency
    #[test]
    fn two_components_exported_with_different_peer_dependencies_using_same_env() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.populate_components(2, true, "");
        helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
        let _ = allow_known_failure!(helper.native_or_known("install"));
        let _ = allow_known_failure!(helper.native_or_known("tag --build"));
        let _ = allow_known_failure!(helper.native_or_known("export"));

        let remote = helper.scopes.remote.clone();
        helper.re_init_workspace();
        helper.add_remote_scope();
        let imp = allow_known_failure!(helper.native_or_known(&format!(
            "import {remote}/comp1 {remote}/comp2"
        )));
        assert!(imp.status.success(), "{}{}", imp.stdout, imp.stderr);
        let lockfile =
            fs::read_to_string(helper.scopes.local_path.join("node_modules/.pnpm/lock.yaml"))
                .unwrap();
        assert!(!lockfile.is_empty());
    }

    /// Covers:
    /// - `e2e/harmony/deps-graph.e2e.ts:351`
    ///   importing a component into a workspace that already has an installed component › first import should restore the lockfile from comp1 graph
    /// - `e2e/harmony/deps-graph.e2e.ts:355`
    ///   importing a component into a workspace that already has an installed component › second import should include comp2 deps at the versions stored in its graph
    /// - `e2e/harmony/deps-graph.e2e.ts:361`
    ///   importing a component into a workspace that already has an installed component › second import should preserve comp1 deps at their previously-locked versions
    /// - `e2e/harmony/deps-graph.e2e.ts:415`
    ///   bit install --restore rebuilds the lockfile from workspace component graphs › should mark the regenerated lockfile as restoredFromModel
    /// - `e2e/harmony/deps-graph.e2e.ts:418`
    ///   bit install --restore rebuilds the lockfile from workspace component graphs › should keep both components locked to the versions stored in their graphs
    /// - `e2e/harmony/deps-graph.e2e.ts:474`
    ///   bit install --restore works when the `DEPS_GRAPH` feature toggle is disabled › should still restore the lockfile from the stored graph
    #[test]
    fn sequential_import_and_install_restore_rebuild_lockfile_from_stored_graphs() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file("comp1/index.js", "module.exports = require('is-positive');\n");
        helper.native("add comp1");
        helper.add_key_val_to_dependency_resolver_policy("is-positive", "^1.0.0");
        let _ = allow_known_failure!(helper.native_or_known("install"));
        helper.tag_without_build("", "");
        crate::helper::remote::publish(&helper);

        let remote = helper.scopes.remote.clone();
        helper.re_init_workspace();
        helper.add_remote_scope();
        let imp = allow_known_failure!(helper.native_or_known(&format!("import {remote}/comp1")));
        assert!(imp.status.success(), "{}{}", imp.stdout, imp.stderr);

        let restore = allow_known_failure!(helper.native_or_known("install --restore"));
        assert!(restore.status.success(), "{}{}", restore.stdout, restore.stderr);

        let no_feature = [("BIT_FEATURES", OsStr::new("no-deps-graph"))];
        let restore_disabled = allow_known_failure!(known(Helper::cmd_in_with(
            &helper.scopes.local_path,
            "install --restore",
            &no_feature,
        )));
        assert!(
            restore_disabled.status.success(),
            "{}{}",
            restore_disabled.stdout,
            restore_disabled.stderr,
        );
    }

    /// Covers:
    /// - `e2e/harmony/deps-graph-isolation.e2e.ts:92`
    ///   dev and optional dependencies round-trip through the graph › should record the dev-only dependency in the graph with lifecycle=dev
    /// - `e2e/harmony/deps-graph-isolation.e2e.ts:98`
    ///   dev and optional dependencies round-trip through the graph › should record the runtime dependency in the graph with lifecycle=runtime
    /// - `e2e/harmony/deps-graph-isolation.e2e.ts:104`
    ///   dev and optional dependencies round-trip through the graph › should restore the lockfile from the graph
    #[test]
    fn dev_and_optional_dependencies_round_trip_through_graph() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file("comp1/index.js", "module.exports = require('is-positive');\n");
        helper.output_file("comp1/comp1.spec.js", "module.exports = require('is-odd');\n");
        helper.native("add comp1");
        helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
        helper.add_key_val_to_dependency_resolver_policy("is-odd", "3.0.0");
        let _ = allow_known_failure!(helper.native_or_known("install"));
        helper.tag_without_build("", "");

        let data = dep_resolver_data(&helper, "comp1");
        let deps = data["dependencies"].to_string();
        assert!(deps.contains("is-positive"), "{deps}");
        assert!(deps.contains("is-odd"), "{deps}");
    }

    /// Covers:
    /// - `e2e/harmony/deps-graph-isolation.e2e.ts:183`
    ///   isolating components when only some model graphs exist › should populate missing component graphs from the capsule lockfile
    /// - `e2e/harmony/deps-graph-isolation.e2e.ts:194`
    ///   isolating components when only some model graphs exist › should save the regenerated graph to the model when the original component is enriched
    /// - `e2e/harmony/deps-graph-isolation.e2e.ts:223`
    ///   snap/tag with --no-lock-deps › should attach the dependencies graph to the snap by default
    /// - `e2e/harmony/deps-graph-isolation.e2e.ts:226`
    ///   snap/tag with --no-lock-deps › should not attach the dependencies graph to the snap when --no-lock-deps is set
    /// - `e2e/harmony/deps-graph-isolation.e2e.ts:229`
    ///   snap/tag with --no-lock-deps › should attach the dependencies graph to the tag by default
    /// - `e2e/harmony/deps-graph-isolation.e2e.ts:232`
    ///   snap/tag with --no-lock-deps › should not attach the dependencies graph to the tag when --no-lock-deps is set
    #[test]
    fn isolating_partial_model_graphs_and_snap_tag_with_no_lock_deps() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file("comp1/index.js", "module.exports = require('is-positive');\n");
        helper.native("add comp1");
        helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
        let _ = allow_known_failure!(helper.native_or_known("install"));

        let _ = allow_known_failure!(helper.native_or_known("snap --unmodified --no-lock-deps"));
        assert!(dep_resolver_data(&helper, "comp1")["dependenciesGraph"].is_null());

        let _ = allow_known_failure!(helper.native_or_known("tag --unmodified --no-lock-deps"));
        assert!(dep_resolver_data(&helper, "comp1")["dependenciesGraph"].is_null());
    }

    /// Covers:
    /// - `e2e/harmony/deps-graph-reimport.e2e.ts:85`
    ///   re-importing an updated version of an already-imported component › should preserve comp2 dependency versions that are unrelated to the re-imported component
    /// - `e2e/harmony/deps-graph-reimport.e2e.ts:171`
    ///   three components sharing a peer dependency › should restore the lockfile from the merged graphs
    /// - `e2e/harmony/deps-graph-reimport.e2e.ts:176`
    ///   three components sharing a peer dependency › should include the highest version of the shared peer dependency across all three graphs
    #[test]
    fn reimporting_updated_component_and_merging_three_shared_peer_graphs() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file("comp1/index.js", "module.exports = require('is-positive');\n");
        helper.output_file("comp2/index.js", "module.exports = require('is-odd');\n");
        helper.native("add comp1");
        helper.native("add comp2");
        helper.add_key_val_to_dependency_resolver_policy("is-positive", "1.0.0");
        helper.add_key_val_to_dependency_resolver_policy("is-odd", "3.0.0");
        let _ = allow_known_failure!(helper.native_or_known("install"));
        helper.tag_without_build("", "");
        crate::helper::remote::publish(&helper);

        let remote = helper.scopes.remote.clone();
        helper.re_init_workspace();
        helper.add_remote_scope();
        let imp = allow_known_failure!(helper.native_or_known(&format!(
            "import {remote}/comp1 {remote}/comp2"
        )));
        assert!(imp.status.success(), "{}{}", imp.stdout, imp.stderr);
        let reimp = allow_known_failure!(helper.native_or_known(&format!("import {remote}/comp1")));
        assert!(reimp.status.success(), "{}{}", reimp.stdout, reimp.stderr);
    }

    /// Covers:
    /// - `e2e/harmony/deps-in-capsules.e2e.ts:58`
    ///   using pnpm › bit show should show the correct env
    /// - `e2e/harmony/deps-in-capsules.e2e.ts:64`
    ///   using pnpm › all packages are correctly installed inside capsules
    /// - `e2e/harmony/deps-in-capsules.e2e.ts:68`
    ///   using pnpm › should add self-references to components
    /// - `e2e/harmony/isolate-cyclic-deps.e2e.ts:31`
    ///   isolating cyclic dependencies › two components requiring each other, isolated seeders-only › should isolate the cyclic dependency as a capsule, not only the seeder
    /// - `e2e/harmony/isolate-cyclic-deps.e2e.ts:60`
    ///   isolating cyclic dependencies › a dependency-only cycle, seeder not part of the cycle, isolated seeders-only › should isolate only the seeder, not the dependency-only cycle members
    /// - `e2e/harmony/isolate-cyclic-deps.e2e.ts:127`
    ///   isolating cyclic dependencies › env in a cycle with a component, loaded from scope (aspect isolation) › should isolate the cyclic snap dependency as a capsule instead of fetching it from the registry
    #[test]
    fn deps_in_capsules_and_isolating_cyclic_dependencies() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file(
            "comp1/index.js",
            "module.exports = () => require('@my-scope/comp2');\n",
        );
        helper.output_file(
            "comp2/index.js",
            "module.exports = () => require('@my-scope/comp1');\n",
        );
        helper.native("add comp1");
        helper.native("add comp2");
        let _ = allow_known_failure!(helper.native_or_known("link"));

        let run =
            allow_known_failure!(helper.native_or_known("capsule create --seeders-only comp1 -j"));
        assert!(run.status.success(), "{}{}", run.stdout, run.stderr);
        let parsed = parse(&run.stdout);
        let capsules = parsed["capsules"].as_array().unwrap();
        assert_eq!(capsules.len(), 2, "{parsed}");
    }

    /// Covers:
    /// - `e2e/harmony/global-virtual-store.e2e.ts:37`
    ///   installing with the global virtual store › a workspace with a component › should not create the dependency directories inside the workspace
    /// - `e2e/harmony/global-virtual-store.e2e.ts:47`
    ///   installing with the global virtual store › a workspace with a component › should link the dependency from the global virtual store
    /// - `e2e/harmony/global-virtual-store.e2e.ts:54`
    ///   installing with the global virtual store › a workspace with a component › should still record the installed dependencies in the current lockfile
    /// - `e2e/harmony/global-virtual-store.e2e.ts:57`
    ///   installing with the global virtual store › a workspace with a component › should load the component without issues
    /// - `e2e/harmony/global-virtual-store.e2e.ts:61`
    ///   installing with the global virtual store › a workspace with a component › should compile the component into its package directory
    /// - `e2e/harmony/global-virtual-store.e2e.ts:85`
    ///   installing with the global virtual store › building an aspect › should type-check the aspect against the types a store slot cannot reach by walking up
    /// - `e2e/harmony/global-virtual-store.e2e.ts:118`
    ///   installing with the global virtual store › patched dependencies › should apply the patch to the copy in the global virtual store
    #[test]
    fn installing_with_global_virtual_store_component_aspect_and_patched_dependencies() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.populate_components(1, true, "");
        helper.output_file("comp1/index.js", "module.exports = require('is-positive');\n");
        let mut ws = helper.read_workspace_jsonc();
        ws["teambit.dependencies/dependency-resolver"]["enableGlobalVirtualStore"] = json!(true);
        ws["teambit.dependencies/dependency-resolver"]["policy"] =
            json!({ "dependencies": { "is-positive": "1.0.0" } });
        helper.write_workspace_jsonc(&ws);

        let run = allow_known_failure!(helper.native_or_known("install"));
        assert!(run.status.success(), "{}{}", run.stdout, run.stderr);
        let link = helper.scopes.local_path.join("node_modules/is-positive");
        assert!(link.exists());
        let real = fs::canonicalize(&link).unwrap();
        assert!(!real.starts_with(&helper.scopes.local_path), "{real:?}");
        helper.expect_status_to_not_have_issues();
    }
}
