use super::{Subcommand, parse_subcommand, prepare, write::WriteTarget};
use crate::commands::{color::Chalk, set_peer::DEP_RESOLVER_ID};
use serde_json::{Value, json};
use std::fs;
use tempfile::tempdir;

#[test]
fn parses_deps_subcommands() {
    assert_eq!(
        parse_subcommand(&["set", "comp1", "lodash@3.3.1", "@scoped/btn@1.0.0", "--dev"]),
        Some(Subcommand::Set {
            pattern: "comp1".into(),
            packages: vec![
                ("lodash".into(), "3.3.1".into()),
                ("@scoped/btn".into(), "1.0.0".into()),
            ],
            dev: true,
            optional: false,
            peer: false,
        }),
    );
    let snap_ver = "0.0.0-0123456789abcdef0123456789abcdef01234567".into();
    assert_eq!(
        parse_subcommand(&["set", "comp1", "pkg@0123456789abcdef0123456789abcdef01234567", "-o"]),
        Some(Subcommand::Set {
            pattern: "comp1".into(),
            packages: vec![("pkg".into(), snap_ver)],
            dev: false,
            optional: true,
            peer: false,
        }),
    );
    assert_eq!(parse_subcommand(&["set", "comp1", "lodash"]), None);
    assert_eq!(parse_subcommand(&["set", "comp1", "lodash@latest"]), None);
    assert_eq!(
        parse_subcommand(&["remove", "comp1", "lodash@3.3.1", "ramda", "-d"]),
        Some(Subcommand::Remove {
            pattern: "comp1".into(),
            packages: vec!["lodash@3.3.1".into(), "ramda".into()],
            dev: true,
            peer: false,
        }),
    );
    assert_eq!(
        parse_subcommand(&["unset", "comp1", "lodash", "-p"]),
        Some(Subcommand::Unset {
            pattern: "comp1".into(),
            packages: vec!["lodash".into()],
            dev: false,
            peer: true,
        }),
    );
    assert_eq!(
        parse_subcommand(&["reset", "comp*"]),
        Some(Subcommand::Reset { pattern: "comp*".into() }),
    );
    assert_eq!(
        parse_subcommand(&["eject", "comp1"]),
        Some(Subcommand::Eject { pattern: "comp1".into() }),
    );
    assert_eq!(
        parse_subcommand(&["unknown-sub"]),
        Some(Subcommand::Unrecognized("unknown-sub".into())),
    );
    assert_eq!(parse_subcommand(&["get", "comp1"]), Some(Subcommand::Get { id: "comp1".into() }));
    assert_eq!(
        parse_subcommand(&["usage", "is-number", "--depth=2"]),
        Some(Subcommand::Usage { dep_name: "is-number".into(), depth: Some(2) }),
    );
    assert_eq!(
        parse_subcommand(&["write", "--target=package.json"]),
        Some(Subcommand::Write { target: WriteTarget::PackageJson }),
    );
}

#[test]
fn sets_and_resets_dependencies_in_bitmap() {
    let dir = tempdir().expect("tempdir");
    fs::write(
        dir.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .expect("write workspace.jsonc");
    fs::write(
        dir.path().join(".bitmap"),
        r#"{ "comp1": { "scope": "", "version": "", "mainFile": "index.ts", "rootDir": "comp1" }, "$schema-version": "17.0.0" }"#,
    )
    .expect("write .bitmap");
    fs::create_dir_all(dir.path().join("comp1")).expect("mkdir comp1");

    let set_cmd = Subcommand::Set {
        pattern: "comp1".into(),
        packages: vec![("lodash".into(), "3.3.1".into())],
        dev: false,
        optional: false,
        peer: false,
    };
    let report = prepare(dir.path(), &set_cmd, Chalk::new(false))
        .expect("prepare set")
        .commit(Chalk::new(false))
        .expect("commit set");
    assert!(report.data.contains("successfully updated dependencies"));
    assert!(report.data.contains("my-scope/comp1"));

    let dev_cmd = Subcommand::Set {
        pattern: "comp1".into(),
        packages: vec![("ramda".into(), "0.27.0".into())],
        dev: true,
        optional: false,
        peer: false,
    };
    prepare(dir.path(), &dev_cmd, Chalk::new(false))
        .expect("prepare dev set")
        .commit(Chalk::new(false))
        .expect("commit dev set");

    let bitmap_after_set: Value =
        bit_object_import::parse_jsonc(&fs::read(dir.path().join(".bitmap")).expect("read bitmap"))
            .expect("parse bitmap");
    assert_eq!(
        bitmap_after_set["comp1"]["config"][DEP_RESOLVER_ID],
        json!({
            "policy": {
                "dependencies": { "lodash": "3.3.1" },
                "devDependencies": { "ramda": "0.27.0" },
            }
        }),
    );

    let reset_cmd = Subcommand::Reset { pattern: "comp1".into() };
    let reset_report = prepare(dir.path(), &reset_cmd, Chalk::new(false))
        .expect("prepare reset")
        .commit(Chalk::new(false))
        .expect("commit reset");
    assert!(reset_report.data.contains("successfully reset dependencies"));

    let bitmap_after_reset: Value =
        bit_object_import::parse_jsonc(&fs::read(dir.path().join(".bitmap")).expect("read bitmap"))
            .expect("parse bitmap");
    assert_eq!(bitmap_after_reset["comp1"]["config"][DEP_RESOLVER_ID], json!({ "policy": {} }));
}

#[test]
fn sets_removes_gets_and_writes_dependencies() {
    let dir = tempdir().expect("tempdir");
    fs::write(
        dir.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .expect("write workspace.jsonc");
    fs::write(
        dir.path().join(".bitmap"),
        r#"{ "comp1": { "scope": "", "version": "", "mainFile": "index.js", "rootDir": "comp1" }, "$schema-version": "17.0.0" }"#,
    )
    .expect("write .bitmap");
    fs::create_dir_all(dir.path().join("comp1")).expect("mkdir comp1");
    fs::write(dir.path().join("comp1/index.js"), "module.exports = 1;\n").expect("write index.js");
    fs::write(
        dir.path().join("comp1/component.json"),
        r#"{ "componentId": { "name": "comp1", "scope": "my-scope" }, "extensions": {} }"#,
    )
    .expect("write component.json");

    let set_cmd = Subcommand::Set {
        pattern: "comp1".into(),
        packages: vec![("lodash".into(), "3.3.1".into()), ("ramda".into(), "0.27.0".into())],
        dev: false,
        optional: false,
        peer: false,
    };
    prepare(dir.path(), &set_cmd, Chalk::new(false))
        .expect("prepare set")
        .commit(Chalk::new(false))
        .expect("commit set");

    let rm_cmd = Subcommand::Remove {
        pattern: "comp1".into(),
        packages: vec!["ramda".into()],
        dev: false,
        peer: false,
    };
    prepare(dir.path(), &rm_cmd, Chalk::new(false))
        .expect("prepare remove")
        .commit(Chalk::new(false))
        .expect("commit remove");

    let comp_json: Value =
        serde_json::from_slice(&fs::read(dir.path().join("comp1/component.json")).expect("read"))
            .expect("parse");
    assert_eq!(
        comp_json["extensions"][DEP_RESOLVER_ID]["policy"]["dependencies"],
        json!({ "lodash": "3.3.1" }),
    );

    let get_cmd = Subcommand::Get { id: "comp1".into() };
    let get_report = prepare(dir.path(), &get_cmd, Chalk::new(false))
        .expect("prepare get")
        .commit(Chalk::new(false))
        .expect("commit get");
    assert!(get_report.data.contains("no dependencies found for my-scope/comp1"));

    let write_cmd = Subcommand::Write { target: WriteTarget::PackageJson };
    prepare(dir.path(), &write_cmd, Chalk::new(false))
        .expect("prepare write")
        .commit(Chalk::new(false))
        .expect("commit write");
    let pkg_json: Value =
        serde_json::from_slice(&fs::read(dir.path().join("package.json")).expect("read pkg.json"))
            .expect("parse pkg.json");
    assert_eq!(pkg_json["dependencies"]["lodash"], "3.3.1");
}
