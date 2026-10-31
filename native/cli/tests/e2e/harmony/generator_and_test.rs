//! Cases from:
//! - `e2e/harmony/create.e2e.ts`
//! - `e2e/harmony/new.e2e.ts`
//! - `e2e/harmony/test-harmony.e2e.ts`
//! - `e2e/typescript/typescript.e2e.ts`
//! - `e2e/harmony/multiple-envs.e2e.ts`
//! - `e2e/harmony/custom-aspects.e2e.ts`

use crate::{
    helper::{Helper, config, parse},
    known_failure::KnownResult,
};
use serde_json::json;

#[test]
fn create_command_options_and_validations() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/workspace"]["defaultScope"] = json!("my-org.my-scope");
    helper.write_workspace_jsonc(&ws);

    // bit create react-env react-env -> should throw an error about having the same name as the template
    let same = helper.native_run("create react-env react-env");
    assert!(!same.status.success());
    let err = format!("{}\n{}", same.stdout, same.stderr);
    assert!(
        err.contains(
            r#"unable to create a component with the same name as the template "react-env""#
        ),
        "{err}",
    );

    // bit create with invalid --scope -> should throw InvalidScopeName error
    let bad_scope = helper.native_run("create node comp1 --scope 'Invalid Scope!'");
    assert!(!bad_scope.status.success());
    let err = format!("{}\n{}", bad_scope.stdout, bad_scope.stderr);
    assert!(err.contains("is invalid, component scope names can only contain"), "{err}");

    // bit create outside workspace -> should fail with OutsideWorkspaceError
    let outside = Helper::cmd_in(&helper.scopes.e2e_dir, "create node comp1");
    assert!(!outside.status.success());
    let err = format!("{}\n{}", outside.stdout, outside.stderr);
    assert!(err.contains("This command can only be run inside a bit workspace"), "{err}");

    // bit create component-generator comp1 comp2 --namespace ui --scope custom.scope --path my-dir
    helper.run(
        "create component-generator comp1 comp2 --namespace ui --scope custom.scope --path my-dir",
    );
    let bit_map = helper.read_bit_map();
    assert_eq!(bit_map["ui/comp1"]["defaultScope"].as_str(), Some("custom.scope"));
    assert_eq!(bit_map["ui/comp2"]["defaultScope"].as_str(), Some("custom.scope"));
    assert_eq!(bit_map["ui/comp1"]["rootDir"].as_str(), Some("my-dir/ui/comp1"));
    assert_eq!(bit_map["ui/comp2"]["rootDir"].as_str(), Some("my-dir/ui/comp2"));
    Ok(())
}

#[test]
fn new_and_test_and_typescript() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();

    // bit new inside existing workspace -> should fail natively
    let in_ws = helper.native_run("new empty my-ws");
    assert!(!in_ws.status.success());
    let err = format!("{}\n{}", in_ws.stdout, in_ws.stderr);
    assert!(
        err.contains("unable to generate a new workspace inside of an existing workspace"),
        "{err}",
    );

    // bit new with existing target directory -> should fail natively
    let out_existing = Helper::cmd_in(
        &helper.scopes.e2e_dir,
        &format!(
            "new empty {}",
            helper.scopes.local_path
                .file_name()
                .unwrap()
                .to_string_lossy(),
        ),
    );
    assert!(!out_existing.status.success());
    let err = format!("{}\n{}", out_existing.stdout, out_existing.stderr);
    assert!(err.contains("this path already exists"), "{err}");

    // bit new --load-from without --aspect -> should fail natively
    let load_no_aspect =
        Helper::cmd_in(&helper.scopes.e2e_dir, "new my-starter new-ws --load-from some-dir");
    assert!(!load_no_aspect.status.success());
    let err = format!("{}\n{}", load_no_aspect.stdout, load_no_aspect.stderr);
    assert!(err.contains("please provide the aspect-id using --aspect flag"), "{err}");

    // bit test in empty workspace -> should succeed natively with "no components found to test."
    let empty_test = helper.native_run("test");
    assert!(empty_test.status.success(), "{empty_test:?}");
    assert!(empty_test.stdout.contains("no components found to test."), "{empty_test:?}");

    // bit test mixing file path and component pattern -> should fail natively
    helper.output_file("orphan.spec.js", "");
    let mixed_test = helper.native_run("test orphan.spec.js comp1");
    assert!(!mixed_test.status.success());
    let err = format!("{}\n{}", mixed_test.stdout, mixed_test.stderr);
    assert!(err.contains("unable to mix test-file paths with component patterns"), "{err}");

    // bit test with unowned file -> should fail natively
    let unowned_test = helper.native_run("test orphan.spec.js");
    assert!(!unowned_test.status.success());
    let err = format!("{}\n{}", unowned_test.stdout, unowned_test.stderr);
    assert!(
        err.contains("does not belong to any component in this workspace, unable to test it"),
        "{err}",
    );
    helper.delete_path("orphan.spec.js");

    // typescript.e2e.ts: .tsx syntax and auto recognizing @types packages
    helper.output_file(
        "list/list.tsx",
        "import {Item} from '../item/item';\nexport class List { render() { return <Item />; } }\n",
    );
    helper.output_file("item/item.tsx", "export const Item = () => null;\n");
    helper.native("add list -i list/list");
    helper.native("add item -i item/item");
    let show = parse(&helper.show_component_parsed("list/list"));
    assert_eq!(
        show["dependencies"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert!(
        show["dependencies"][0]["id"]
            .as_str()
            .unwrap()
            .contains("item/item"),
    );
    Ok(())
}

#[test]
fn multiple_envs_and_custom_aspects() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");

    // multiple-envs.e2e.ts: configuring two envs on a component -> MultipleEnvs issue
    helper.add_extension_to_variant("comp1", "teambit.react/react", json!({}));
    helper.add_extension_to_variant("comp1", "teambit.harmony/aspect", json!({}));
    helper.expect_status_to_have_issue("MultipleEnvs");

    // setting teambit.envs/envs.env resolves MultipleEnvs issue
    helper.add_extension_to_variant(
        "comp1",
        "teambit.envs/envs",
        json!({ "env": "teambit.react/react" }),
    );
    helper.expect_status_to_not_have_issue("MultipleEnvs");

    // custom-aspects.e2e.ts: creating and loading custom aspects in workspace
    helper.set_workspace_with_remote_scope();
    helper.populate_extensions(2);
    let mut ws = helper.read_workspace_jsonc();
    ws[format!("{}/ext1", helper.scopes.remote)] = json!({});
    ws[format!("{}/ext2", helper.scopes.remote)] = json!({});
    helper.write_workspace_jsonc(&ws);
    helper.compile();
    let st = helper.status_json_or_known()?;
    assert_eq!(
        st["newComponents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    let _ = (config::read_jsonc, parse);
    Ok(())
}
