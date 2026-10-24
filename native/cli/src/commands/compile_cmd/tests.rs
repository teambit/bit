use super::{
    Options, is_empty_workspace, parse_options,
    transpile::{dist_rel_path, is_compilable_file, transpile_source},
};
use std::fs;

#[test]
fn parses_compile_options() {
    assert_eq!(
        parse_options(&["comp1", "comp2", "-c", "-v", "--json", "-d", "--generate-types"]),
        Some(Options {
            components: vec!["comp1".into(), "comp2".into()],
            changed: true,
            verbose: true,
            json: true,
            delete_dist_dir: true,
            generate_types: true,
        }),
    );
}

#[test]
fn detects_empty_workspace_for_compile() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();
    assert!(is_empty_workspace(temp.path()).unwrap());
}

#[test]
fn transpiles_ts_and_esm_files_to_commonjs() {
    assert!(is_compilable_file("index.ts"));
    assert!(!is_compilable_file("types.d.ts"));
    assert_eq!(dist_rel_path("nested/foo.ts"), "nested/foo.js");
    let src = "import comp2 from '@scope/comp2';\nexport type MyType = { a: number };\nexport const x: number = 42;\nexport default () => comp2();\n";
    let out = transpile_source(src, "index.ts", "index.js.map");
    assert!(out.contains("__importDefault(require('@scope/comp2'))"));
    assert!(!out.contains("MyType"));
    assert!(out.contains("const x = 42;"));
    assert!(out.contains("exports.x = x;"));
    assert!(out.contains("exports.default = () => comp2();"));
}
