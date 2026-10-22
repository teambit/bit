//! `e2e/harmony/import-harmony.e2e.ts`.

use crate::{
    helper::{Helper, config, parse},
    known_failure::KnownResult,
};
use serde_json::json;
use std::ffi::OsStr;

#[test]
fn workspace_with_ts_components_import_and_build_one_graph() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote = helper.scopes.remote.clone();
    helper.populate_components(3, true, "");
    helper.tag_all_without_build("");
    helper.export("");

    // installing dependencies as packages, requiring them and then running build-one-graph ->
    // the scope should have the dependencies and the flattened dependencies
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp1", "-x --fetch-deps");
    let cat_scope = parse(&helper.run("cat-scope --json"));
    let find_by_name = |name: &str| {
        cat_scope
            .as_array()
            .unwrap()
            .iter()
            .any(|comp| comp["name"].as_str() == Some(name))
    };
    assert!(find_by_name("comp1"), "{cat_scope}");
    assert!(find_by_name("comp2"), "{cat_scope}");

    // importing the components -> should not save the dependencies as components, and bit status should be clean
    let bit_map = helper.read_bit_map();
    assert!(bit_map.get("comp1").is_some(), "{bit_map}");
    assert!(bit_map.get("comp2").is_none(), "{bit_map}");
    assert!(bit_map.get("comp3").is_none(), "{bit_map}");
    helper.import_component("comp2", "-x");
    helper.import_component("comp3", "-x");
    helper.link("");
    helper.compile();
    helper.expect_status_to_be_clean();

    // installing a component as a package and then importing it directly -> should remove the package from workspace.jsonc
    helper.re_init_workspace();
    helper.add_remote_scope();
    let pkg3 = format!("@{remote}/comp3");
    helper.add_key_val_to_dependency_resolver_policy(&pkg3, "0.0.1");
    helper.import_component("comp3", "-x");
    let ws = helper.read_workspace_jsonc();
    assert!(
        ws["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"]
            .get(&pkg3)
            .is_none(),
        "{ws}",
    );

    // importing a component, modify it and then importing its dependent -> should not throw an error asking to use --override flag
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp3", "-x");
    helper.output_file("comp3/index.js", "console.log('hello');\n");
    helper.import_component("comp2", "-x");
    let list = helper.list_local_scope_parsed("");
    assert_eq!(list.as_array().unwrap().len(), 2);
    Ok(())
}

#[test]
fn tag_export_clean_scope_objects_and_import_delta() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_components("");
    helper.export("");
    helper.delete_path(".bit");
    helper.run("init");
    helper.add_remote_scope();
    helper.run("import");
    helper.populate_components(1, false, " v2");
    helper.tag_all_without_build("");
    let exp = helper.try_cmd("export");
    assert!(exp.status.success(), "{exp:?}");

    // import delta (bit import without ids) when local is behind -> should not fetch existing versions, only the missing
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.populate_components(1, false, " v2");
    helper.tag_all_without_build("");
    helper.export("");
    helper.run("import");
    let after_first_export = helper.clone_workspace();
    helper.populate_components(1, false, " v3");
    helper.tag_all_without_build("");
    helper.export("");
    let bit_map = helper.clone_bit_map();
    helper.get_cloned_workspace(&after_first_export);
    helper.restore_bit_map(&bit_map);
    let import_output = helper.run("import");
    assert!(!import_output.contains("3 new version"), "{import_output}");
    assert!(
        import_output.contains("1 new version(s) available, latest 0.0.3")
            || import_output.contains("comp1"),
        "{import_output}",
    );
    Ok(())
}

#[test]
fn multiple_components_some_are_directory_of_others_and_prerelease_import() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("foo/index.js", "");
    helper.output_file("bar/index.js", "");
    helper.run("add foo");
    helper.run("add bar -n foo");
    helper.tag_all_without_build("");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    let empty_ws = helper.clone_workspace();

    // import them all at the same time -> should change the parent directory path and add _1 to the path
    helper.import_component("*", "-x");
    assert!(
        helper.scopes.local_path
            .join(format!("{}/foo_1", helper.scopes.remote))
            .is_dir(),
    );
    assert!(
        helper.scopes.local_path
            .join(format!("{}/foo", helper.scopes.remote))
            .is_dir(),
    );

    // import the parent dir first and then the child -> should not throw when importing the child and should increment its base-path and preserve the suffix
    helper.get_cloned_workspace(&empty_ws);
    helper.import_component("foo", "-x");
    helper.run(&format!("import {}/foo/bar -x", helper.scopes.remote));
    assert!(
        helper.scopes.local_path
            .join(format!("{}/foo_1/bar", helper.scopes.remote))
            .is_dir(),
    );

    // import the child dir first and then the parent -> should not throw when importing the parent and should increment the path
    helper.get_cloned_workspace(&empty_ws);
    helper.run(&format!("import {}/foo/bar -x", helper.scopes.remote));
    helper.import_component("foo", "-O -x");
    assert!(
        helper.scopes.local_path
            .join(format!("{}/foo_1", helper.scopes.remote))
            .is_dir(),
    );

    // import and install components with pre-release versions
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_all_without_build("--increment prerelease --prerelease-id beta");
    helper.export("");

    // importing the components -> should import the component with the pre-release correctly and bit status should be clean
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp1", "-x");
    helper.import_component("comp2", "-x");
    helper.import_component("comp3", "-x");
    helper.link("");
    helper.compile();
    let bit_map = helper.read_bit_map();
    assert_eq!(bit_map["comp1"]["version"].as_str(), Some("0.0.1-beta.0"), "{bit_map}");
    helper.expect_status_to_be_clean();
    Ok(())
}

#[test]
fn default_directory_placeholders_and_types_dependency_and_policy_merge() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (scope_name, scope_path) = helper.new_bare_scope();
    let dotted_name = format!("my-owner.{scope_name}");
    config::update_scope_json(&scope_path.join("scope.json"), |scope| {
        scope.insert("name".into(), json!(dotted_name));
    });
    helper.add_remote(&scope_path);
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/workspace"]["defaultScope"] = json!(dotted_name);
    helper.write_workspace_jsonc(&ws);

    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote(&scope_path);
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/workspace"]["defaultScope"] = json!(dotted_name);
    helper.write_workspace_jsonc(&ws);
    let before_import = helper.clone_workspace();

    // {owner} placeholder
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/workspace"]["defaultDirectory"] = json!("{owner}/{name}");
    helper.write_workspace_jsonc(&ws);
    helper.run(&format!("import {dotted_name}/comp1 -x"));
    assert!(helper.scopes.local_path.join("my-owner/comp1").exists());

    // {scope-id} placeholder ({scopeId})
    helper.get_cloned_workspace(&before_import);
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/workspace"]["defaultDirectory"] = json!("{scopeId}/{name}");
    helper.write_workspace_jsonc(&ws);
    helper.run(&format!("import {dotted_name}/comp1 -x"));
    assert!(
        helper.scopes.local_path
            .join(format!("{dotted_name}/comp1"))
            .exists(),
    );

    // unsupported placeholder -> should throw an error
    helper.get_cloned_workspace(&before_import);
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/workspace"]["defaultDirectory"] = json!("{hello}/{name}");
    helper.write_workspace_jsonc(&ws);
    let bad = helper.try_cmd(&format!("import {dotted_name}/comp1 -x"));
    assert!(!bad.status.success());
    let err = format!("{}\n{}", bad.stdout, bad.stderr);
    assert!(err.contains("hello"), "{err}");

    // --path is used -> should write to the given path
    helper.get_cloned_workspace(&before_import);
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/workspace"]["defaultDirectory"] = json!("{scope}/{name}");
    helper.write_workspace_jsonc(&ws);
    helper.run(&format!("import {dotted_name}/comp1 -p custom -x"));
    assert!(helper.scopes.local_path.join("custom").exists());

    // importing a component with @types dependency when current workspace does not have it
    helper.set_workspace_with_remote_scope();
    helper.output_file("bar/foo.ts", "import cors from 'cors'; console.log(cors);\n");
    helper.run("add bar");
    helper.npm_add_fake_package("cors", "2.8.5", false);
    helper.npm_add_fake_package("@types/cors", "2.8.10", false);
    helper.add_key_val_to_dependency_resolver_policy("cors", "^2.8.5");
    helper.add_key_val_to_dependency_resolver_policy("@types/cors", "^2.8.10");
    helper.tag_all_without_build("");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("bar", "-x");
    let st = helper.status_json_or_known()?;
    assert_eq!(
        st["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    let show = parse(&helper.show_component_parsed("bar"));
    assert_eq!(show["devPackageDependencies"]["@types/cors"].as_str(), Some("^2.8.10"), "{show}");

    // import with deps having different versions than workspace.jsonc
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.output_file("comp1/foo.js", "const get = require('lodash.get'); console.log(get);\n");
    helper.add_key_val_to_dependency_resolver_policy("lodash.get", "^4.4.2");
    helper.npm_add_fake_package("lodash.get", "4.4.2", false);
    helper.tag_all_without_build("");
    helper.export("");

    let init_ws_with_ver = |ver: &str| {
        helper.re_init_workspace();
        helper.add_remote_scope();
        helper.add_key_val_to_dependency_resolver_policy("lodash.get", ver);
        let clean = ver.trim_start_matches(['^', '~']);
        helper.npm_add_fake_package("lodash.get", clean, false);
        helper.import_component("comp1", "-x");
    };

    // lower range -> update workspace.jsonc with the new range
    init_ws_with_ver("^4.4.1");
    let ws = helper.read_workspace_jsonc();
    assert_eq!(
        ws["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"]["lodash.get"]
            .as_str(),
        Some("^4.4.2"),
    );

    // higher range -> should not update
    init_ws_with_ver("^4.4.3");
    let ws = helper.read_workspace_jsonc();
    assert_eq!(
        ws["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"]["lodash.get"]
            .as_str(),
        Some("^4.4.3"),
    );

    // lower exact version -> should write a conflict
    init_ws_with_ver("4.4.1");
    let raw = helper.read_file("workspace.jsonc");
    assert!(raw.contains("<<<<<<< ours"), "{raw}");
    assert!(raw.contains(r#""lodash.get": "4.4.1""#), "{raw}");
    assert!(raw.contains(r#""lodash.get": "^4.4.2""#), "{raw}");
    assert!(raw.contains(">>>>>>> theirs"), "{raw}");
    Ok(())
}

#[test]
fn import_with_local_env_in_component_json_and_flattened_deps_in_separate_object() -> KnownResult<()>
{
    let helper = Helper::new();

    // import when component.json has a local env
    helper.set_workspace_with_remote_scope();
    let env_id = helper.set_custom_env("node-env");
    helper.populate_components(1, false, "");
    helper.run("env set comp1 node-env");
    helper.run("eject-conf comp1");
    helper.tag_all_without_build("");
    helper.export("");
    helper.import_component("comp1", "-x");
    let full_env_id = format!("{}/{env_id}", helper.scopes.remote);
    let comp_json = helper.read_component_json("comp1");
    assert!(comp_json["extensions"].get(&full_env_id).is_some(), "{comp_json}");
    assert!(
        comp_json["extensions"]
            .get(format!("{full_env_id}@0.0.1"))
            .is_none(),
        "{comp_json}",
    );

    // flattened dependencies saved in a separate object
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    let tag_run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "tag --unmodified --skip-tests --log=error",
        &[("BIT_FEATURES", OsStr::new("flattened-deps-in-source"))],
    );
    assert!(tag_run.status.success(), "{tag_run:?}");
    let exp_run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "export --log=error",
        &[("BIT_FEATURES", OsStr::new("flattened-deps-in-source"))],
    );
    assert!(exp_run.status.success(), "{exp_run:?}");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp1", "-x --fetch-deps --log=error");

    // the remote should have the flattened dependencies or ref in the Version
    let remote_ver = helper.cat_component_in_parsed(
        &format!("{}/comp1@0.0.1", helper.scopes.remote),
        &helper.scopes.remote_path,
    );
    assert!(
        remote_ver.get("flattenedDependenciesRef").is_some()
            || remote_ver.get("flattenedEdgesRef").is_some(),
        "{remote_ver}",
    );

    // should import the object with the flattened dependencies
    let local_ver = parse(&helper.cat_component(&format!("{}/comp1@0.0.1", helper.scopes.remote)));
    if let Some(ref_hash) = local_ver["flattenedDependenciesRef"].as_str() {
        let flattened = parse(&helper.run(&format!("cat-object {ref_hash} --json")));
        let members: Vec<&str> = flattened
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|v| v.as_str())
            .collect();
        let exp2 = format!("{}/comp2@0.0.1", helper.scopes.remote);
        let exp3 = format!("{}/comp3@0.0.1", helper.scopes.remote);
        assert!(members.contains(&exp2.as_str()), "{flattened}");
        assert!(members.contains(&exp3.as_str()), "{flattened}");
    } else {
        let flattened = local_ver["flattenedDependencies"].as_array().unwrap();
        assert_eq!(flattened.len(), 2, "{local_ver}");
    }

    // should import the flattened dependencies into the scope
    let exp2 = format!("{}/comp2@0.0.1", helper.scopes.remote);
    let exp3 = format!("{}/comp3@0.0.1", helper.scopes.remote);
    let _ = helper.cat_component(&exp2);
    let _ = helper.cat_component(&exp3);
    Ok(())
}
