use super::{File, scan};
use serde_json::json;

fn fixture(kind: &str, source: &str) -> File {
    File { path: format!("fixture.{kind}"), source: Some(source.into()), kind: None }
}

#[test]
fn preserves_types_aliases_and_duplicate_metadata() {
    let result = scan(
        &fixture(
            "ts",
            "import type { Foo as Local } from 'pkg'; import Default from 'pkg'; export default Default;",
        ),
        false,
    );
    assert_eq!(result.status, "ok");
    assert_eq!(
        serde_json::to_value(result.dependencies).unwrap(),
        json!({"pkg":{"isTypeImport":false,"importSpecifiers":[{"isDefault":false,"name":"Foo"},{"isDefault":true,"name":"Default","exported":true}]}}),
    );
}

#[test]
fn ignores_only_real_typescript_comments() {
    let result = scan(
        &fixture(
            "ts",
            "const text='@bit-no-check';\n// @bit-ignore\nimport A from 'ignored';\nimport B from 'kept';",
        ),
        false,
    );
    assert_eq!(result.status, "ok");
    assert_eq!(
        result.dependencies
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["kept"],
    );
    let result = scan(&fixture("ts", "import 'first'; // @bit-no-check\nimport 'second';"), false);
    assert_eq!(result.dependencies.len(), 0);
}

#[test]
fn extracts_literal_calls_without_interpolated_or_dynamic_require() {
    let result = scan(
        &fixture(
            "js",
            r"require(`raw\npath`); require(`x${dynamic}`); require.resolve('./resolved'); import('./dynamic'); import(`ignored`);",
        ),
        false,
    );
    assert_eq!(result.status, "ok");
    assert_eq!(
        result.dependencies
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec![r"raw\npath", "./resolved", "./dynamic"],
    );
}

#[test]
fn failed_files_do_not_return_partial_dependencies() {
    let result = scan(&fixture("ts", "import 'ok'; const = ;"), false);
    assert_eq!(result.status, "parse_error");
    assert_eq!(result.dependencies.len(), 0);
    let result = scan(&fixture("ts", "@Component({templateUrl:'x.html'}) class Example {}"), false);
    assert_eq!(result.status, "unsupported");
    assert_eq!(result.dependencies.len(), 0);
    assert_eq!(scan(&fixture("css", "body {}"), false).status, "unsupported");
    assert_eq!(scan(&fixture("js", "import 'x'"), true).status, "unsupported");
}

#[test]
fn javascript_classification_matches_first_recognized_module_node() {
    for source in ["require.resolve('./resolved');", "import.meta.resolve('./resolved');"] {
        let result = scan(&fixture("js", source), false);
        assert_eq!(result.status, "ok");
        assert_eq!(result.dependencies.len(), 0);
    }
    for source in [
        "import './marker'; require.resolve('./resolved');",
        "require.resolve('./resolved'); import './marker';",
        "require(variable); import.meta.resolve('./resolved');",
        "import('./dynamic'); require.resolve('./resolved');",
    ] {
        let result = scan(&fixture("js", source), false);
        assert_eq!(result.status, "ok");
        assert!(result.dependencies.contains_key("./resolved"));
    }
    for source in [
        "module.exports = {}; require.resolve('./resolved');",
        "require(['./amd'], function () {});",
        "define([], function () {}); import './marker';",
    ] {
        assert_eq!(scan(&fixture("js", source), false).status, "unsupported");
    }
    let result = scan(&fixture("ts", "require.resolve('./resolved'); import('./dynamic');"), false);
    assert_eq!(result.dependencies.len(), 2);
}

#[test]
fn javascript_accepts_jsx_and_defers_babel_only_syntax() {
    let result = scan(&fixture("js", "import React from 'react'; const view = <div />;"), false);
    assert_eq!(result.status, "ok");
    assert!(result.dependencies.contains_key("react"));
    for source in ["// @flow\nconst value: number = 1; import 'x';", "import 'ok'; const = ;"] {
        let result = scan(&fixture("js", source), false);
        assert_eq!(result.status, "unsupported");
        assert_eq!(result.dependencies.len(), 0);
    }
}

#[test]
fn bit_ignore_uses_the_line_of_the_dependency_node() {
    let result = scan(
        &fixture(
            "ts",
            "/* a */\n// @bit-ignore\nimport A from 'ignored';\n\n// @bit-ignore\n\nimport B from 'kept';",
        ),
        false,
    );
    assert_eq!(
        result.dependencies
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["kept"],
    );
}
