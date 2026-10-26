//! Relative cross-component and nested untracked dependency detection parity.

use crate::helper::Helper;
use std::{ffi::OsStr, fmt::Write as _};

fn parity(helper: &Helper) {
    let root = helper.clone_workspace();
    let expected =
        Helper::cmd_in_with(&root, "status --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.native_run("status --json");
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
}

#[test]
fn nested_and_repeated_untracked_files_match_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = require('../shared');");
    helper.output_file("bar/second.js", "require('../shared');");
    helper.output_file("shared.js", "module.exports = require('./deep');");
    helper.output_file("deep.js", "module.exports = 1;");
    helper.native("add bar -i bar/foo -m bar/foo.js");
    parity(&helper);
}

#[test]
fn relative_component_commonjs_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("baz/qux.js", "module.exports = 1;");
    helper.native("add baz -i baz/qux");
    helper.create_component_bar_foo("module.exports = require('../baz/qux');");
    helper.add_component_bar_foo();
    parity(&helper);
}

#[test]
fn relative_component_named_import_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("baz/qux.js", "export const qux = 1;");
    helper.native("add baz -i baz/qux");
    helper.create_component_bar_foo("import { qux } from '../baz/qux.js'; export const foo = qux;");
    helper.add_component_bar_foo();
    parity(&helper);
}

#[test]
fn self_reference_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = require('self-component');");
    helper.add_component_bar_foo();
    helper.output_file("node_modules/self-component/index.js", "module.exports = 1;");
    helper.output_file(
        "node_modules/self-component/package.json",
        &serde_json::json!({
            "name":"self-component","version":"0.0.1","main":"index.js",
            "componentId":{"scope":helper.scopes.remote,"name":"bar/foo"}
        })
        .to_string(),
    );
    parity(&helper);
}

#[test]
fn non_main_component_import_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("baz/qux.js", "module.exports = 1;");
    helper.native("add baz -i baz/qux");
    helper.create_component_bar_foo("module.exports = require('external-component/dist/private');");
    helper.add_component_bar_foo();
    helper.output_file("node_modules/external-component/dist/private.js", "module.exports = 1;");
    helper.output_file("node_modules/external-component/dist/index.js", "module.exports = 1;");
    helper.output_file(
        "node_modules/external-component/package.json",
        &serde_json::json!({
            "name":"external-component","version":"1.0.0","main":"dist/index.js",
            "componentId":{"scope":helper.scopes.remote,"name":"baz/qux"}
        })
        .to_string(),
    );
    parity(&helper);
}

#[test]
fn peer_component_metadata_matches_node() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("baz/qux.js", "module.exports = 1;");
    helper.native("add baz -i baz/qux");
    helper.create_component_bar_foo("module.exports = require('peer-component');");
    helper.add_component_bar_foo();
    helper.output_file("node_modules/peer-component/index.js", "module.exports = 1;");
    for range in [serde_json::Value::Null, serde_json::json!("^"), serde_json::json!(">=1.0.0")] {
        helper.output_file(
            "node_modules/peer-component/package.json",
            &serde_json::json!({
                "name":"peer-component","version":"1.2.3","main":"index.js",
                "componentId":{"scope":helper.scopes.remote,"name":"baz/qux"},
                "bit":{"peer":true,"defaultPeerRange":range}
            })
            .to_string(),
        );
        parity(&helper);
    }
}

#[test]
fn external_component_without_package_version_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = require('external-component');");
    helper.add_component_bar_foo();
    helper.output_file("node_modules/external-component/index.js", "module.exports = 1;");
    helper.output_file(
        "node_modules/external-component/package.json",
        &serde_json::json!({
            "name":"external-component","main":"index.js",
            "componentId":{"scope":helper.scopes.remote,"name":"external"}
        })
        .to_string(),
    );
    parity(&helper);
}

#[test]
fn every_released_extension_and_directory_index_reports_untracked_relative_files() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let extensions = [
        "js", "json", "cjs", "mjs", "jsx", "ts", "tsx", "cts", "mts", "d.ts", "css", "scss",
        "sass", "styl", "less",
    ];
    let mut imports = String::new();
    let mut expected = Vec::new();
    for extension in extensions {
        let name = extension.replace('.', "-");
        for (specifier, file) in [
            (format!("direct-{name}"), format!("direct-{name}.{extension}")),
            (format!("directory-{name}"), format!("directory-{name}/index.{extension}")),
        ] {
            writeln!(imports, "require('../shared/{specifier}');").unwrap();
            let file = format!("shared/{file}");
            helper.output_file(&file, if extension == "json" { "{}\n" } else { "\n" });
            expected.push(file);
        }
    }
    helper.output_file("consumer/index.js", &imports);
    helper.native("add consumer -i consumer");
    parity(&helper);
    let actual = helper.native_run("status --json");
    assert!(actual.native, "{}", actual.trace);
    assert!(actual.stdout.contains("UntrackedDependencies"), "{}", actual.stdout);
    assert!(!actual.stdout.contains("MissingDependenciesOnFs"), "{}", actual.stdout);
    for file in expected {
        assert!(actual.stdout.contains(&file), "missing {file}: {}", actual.stdout);
    }
}
