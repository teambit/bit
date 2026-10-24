use super::{
    DryRunMode, Subcommand, WriteOptions,
    clean::{clean_workspace_configs, format_clean_output, format_list_json, format_list_output},
    format::format_write_output,
    parse_subcommand, parse_unrecognized,
    write::write_workspace_configs,
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
fn parses_list_clean_and_write_subcommands() {
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
    assert_eq!(
        parse_subcommand(&[
            "write",
            "-c",
            "-w",
            "typescript,prettier",
            "-n",
            "--dry-run",
            "-v",
            "-s",
            "-j",
        ]),
        Some(Subcommand::Write(WriteOptions {
            clean: true,
            writers: Some(vec!["typescript".into(), "prettier".into()]),
            no_dedupe: true,
            dry_run: DryRunMode::PathsOnly,
            verbose: true,
            silent: true,
            force: false,
            json: true,
        })),
    );
}

#[test]
fn cleans_only_bit_generated_config_files_and_formats_list() {
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
    let list_json = format_list_json(&["teambit.harmony/node".into()]).unwrap();
    assert!(list_json.contains("TypescriptConfigWriter"));
    let clean_out = format_clean_output(&deleted_paths, false, chalk);
    assert!(clean_out.contains("1 config files were deleted"));
}

#[test]
fn writes_standard_workspace_configs_and_formats_output() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let envs = vec!["teambit.harmony/node".to_owned()];
    let comps = vec!["comp1".to_owned(), "ui/comp2".to_owned()];

    let dry_opts = WriteOptions { dry_run: DryRunMode::PathsOnly, ..WriteOptions::default() };
    let dry_res = write_workspace_configs(root, &envs, &comps, &dry_opts).unwrap();
    assert_eq!(dry_res.write_results.total_extending_config_files, 3);
    assert!(!root.join("tsconfig.json").exists());
    assert!(
        dry_res.write_results.writers_result[0].real_config_files[0]
            .written_real_config_file
            .content
            .is_empty(),
    );

    let write_opts = WriteOptions::default();
    let res = write_workspace_configs(root, &envs, &comps, &write_opts).unwrap();
    assert_eq!(res.write_results.total_extending_config_files, 3);
    assert!(
        fs::read_to_string(root.join("tsconfig.json"))
            .unwrap()
            .contains("// bit-generated-typescript-config"),
    );
    assert!(
        fs::read_to_string(root.join(".eslintrc.json"))
            .unwrap()
            .contains("// bit-generated-eslint-config"),
    );
    assert!(
        fs::read_to_string(root.join(".prettierrc.cjs"))
            .unwrap()
            .contains("// bit-generated-prettier-config"),
    );

    let chalk = Chalk::new(false);
    let text = format_write_output(&res, &write_opts, chalk);
    assert!(text.contains("3 config files added to workspace"));
    assert!(text.contains("1 typescript configurations added"));

    let verbose_opts = WriteOptions { verbose: true, ..WriteOptions::default() };
    let verbose_text = format_write_output(&res, &verbose_opts, chalk);
    assert!(verbose_text.contains("Real config files"));
    assert!(verbose_text.contains("Extending config files"));
}

#[test]
fn supports_no_dedupe_writers_filter_and_skips_user_files() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let envs = vec!["teambit.react/react".to_owned()];
    let comps = vec!["comp1".to_owned(), "comp2".to_owned()];
    fs::create_dir_all(root.join("comp1")).unwrap();
    fs::write(root.join("comp1/tsconfig.json"), r#"{"compilerOptions": {}}"#).unwrap();

    let opts = WriteOptions {
        no_dedupe: true,
        writers: Some(vec!["typescript".to_owned()]),
        ..WriteOptions::default()
    };
    let res = write_workspace_configs(root, &envs, &comps, &opts).unwrap();
    assert_eq!(res.write_results.writers_result.len(), 1);
    assert_eq!(res.write_results.total_extending_config_files, 1);
    assert_eq!(res.write_results.skipped_paths.len(), 1);
    assert!(root.join("comp2/tsconfig.json").exists());
}
