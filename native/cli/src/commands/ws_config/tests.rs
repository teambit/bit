use super::{
    Subcommand, clean_workspace_configs, format_clean_output, format_list_output, parse_subcommand,
    parse_unrecognized,
};
use crate::commands::color::Chalk;
use std::fs;

#[test]
fn parses_unrecognized_ws_config_subcommand() {
    assert_eq!(parse_unrecognized(&["foo"]), Some("foo"));
    assert_eq!(parse_unrecognized(&["foo", "--no-color"]), Some("foo"));
    assert_eq!(parse_unrecognized(&["write"]), None);
    assert_eq!(parse_unrecognized(&["clean"]), None);
    assert_eq!(parse_unrecognized(&["list"]), None);
    assert_eq!(parse_unrecognized(&["--help"]), None);
    assert_eq!(parse_unrecognized(&[]), None);
}

#[test]
fn parses_list_and_clean_subcommands() {
    assert_eq!(parse_subcommand(&["list"]), Some(Subcommand::List { json: false }));
    assert_eq!(parse_subcommand(&["list", "-j"]), Some(Subcommand::List { json: true }));
    assert_eq!(
        parse_subcommand(&["clean", "--silent", "--dry-run", "-w", "typescript,eslint", "--json"]),
        Some(Subcommand::Clean {
            silent: true,
            dry_run: true,
            writers: Some(vec!["typescript".into(), "eslint".into()]),
            json: true,
        }),
    );
}

#[test]
fn cleans_only_bit_generated_config_files() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::write(
        root.join("tsconfig.json"),
        "// bit-generated-typescript-config\n{\n  \"extends\": \"./x\"\n}\n",
    )
    .unwrap();
    fs::write(root.join(".eslintrc.json"), "{\n  \"root\": true\n}\n").unwrap();
    let dry_paths = clean_workspace_configs(root, None, true).unwrap();
    assert_eq!(dry_paths, vec!["tsconfig.json".to_owned()]);
    assert!(root.join("tsconfig.json").exists());

    let deleted_paths = clean_workspace_configs(root, None, false).unwrap();
    assert_eq!(deleted_paths, vec!["tsconfig.json".to_owned()]);
    assert!(!root.join("tsconfig.json").exists());
    assert!(root.join(".eslintrc.json").exists());

    let chalk = Chalk::new(false);
    let list_out = format_list_output(&["teambit.harmony/node".into()], chalk);
    assert!(list_out.contains("TypescriptConfigWriter (typescript)"));
    let clean_out = format_clean_output(&deleted_paths, false, chalk);
    assert!(clean_out.contains("1 config files were deleted"));
}
