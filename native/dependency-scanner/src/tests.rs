use super::{File, Outcome, scan_with_metrics};
fn scan(file: &File, unsupported_options: bool) -> Outcome {
    scan_with_metrics(file, unsupported_options, None)
}
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

#[test]
fn source_limit_requests_fallback_without_partial_dependencies() {
    let source = " ".repeat(crate::limits::SOURCE_BYTES + 1);
    assert_eq!(scan(&fixture("ts", &source), false).status, "unsupported");
    let source = " ".repeat(crate::limits::SOURCE_BYTES);
    assert_eq!(scan(&fixture("ts", &source), false).status, "ok");
    assert_eq!(scan(&fixture("ts", "require(123); require(true);"), false).status, "unsupported");
}

#[test]
fn wire_metadata_preserves_legacy_string_names_and_optional_calls() {
    let result = scan(
        &fixture(
            "js",
            "import { 'some-name' as named } from 'pkg'; export { named as 'export-name' } from 'other'; require?.('./optional'); import.meta[resolve]('./computed');",
        ),
        false,
    );
    assert_eq!(
        serde_json::to_value(result.dependencies).unwrap(),
        json!({"pkg":{"importSpecifiers":[{"isDefault":false}]},"other":{"importSpecifiers":[{"isDefault":false,"exported":true}]},"./computed":{}}),
    );
}

#[test]
fn oversized_batch_preserves_session_protocol_error() {
    let files: Vec<_> = (0..=crate::limits::BATCH_FILES)
        .map(|_| json!({"path":"empty.ts","source":""}))
        .collect();
    let request = json!({"version":1,"files":files}).to_string();
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(1)
        .build()
        .unwrap();
    let response = crate::protocol::process_request(&request, &pool).unwrap();
    assert_eq!(response["status"], "invalid_request");
    let response =
        crate::protocol::process_request(r#"{"version":1,"files":[],"id":"next"}"#, &pool).unwrap();
    assert_eq!(response["id"], "next");
}

#[test]
fn disk_source_limit_and_invalid_encoding_have_distinct_outcomes() {
    let path = std::env::temp_dir().join(format!("bit-source-limit-{}", std::process::id()));
    let disk = std::fs::File::create(&path).unwrap();
    disk.set_len((crate::limits::SOURCE_BYTES + 1) as u64)
        .unwrap();
    let file = File { path: path.to_str().unwrap().into(), source: None, kind: Some("ts".into()) };
    assert_eq!(scan(&file, false).status, "unsupported");
    std::fs::write(&path, b"import './valid'; // invalid encoding: \xff").unwrap();
    let result = scan(&file, false);
    assert_eq!(result.status, "unsupported");
    assert_eq!(result.dependencies.len(), 0);
    std::fs::remove_file(&path).unwrap();
    assert_eq!(scan(&file, false).status, "read_error");
}

fn keys(kind: &str, source: &str) -> (&'static str, Vec<String>) {
    let result = scan(&fixture(kind, source), false);
    (result.status, result.dependencies.into_keys().collect())
}

#[test]
fn parentheses_and_optional_chains_follow_legacy_ast_shapes() {
    assert_eq!(keys("js", "import 'm'; (require)('./p');"), ("ok", vec!["m".into(), "./p".into()]));
    assert_eq!(keys("ts", "(require.resolve)(('./p'));"), ("ok", vec!["./p".into()]));
    // Babel's OptionalCallExpression covers every call after the first `?.`.
    assert_eq!(keys("js", "import 'm'; require?.resolve('./x');"), ("ok", vec!["m".into()]));
    assert_eq!(keys("ts", "require?.resolve('./x');"), ("ok", vec!["./x".into()]));
    assert_eq!(
        keys("js", "require('x')?.foo; require.resolve('./r');"),
        ("ok", vec!["x".into(), "./r".into()]),
    );
    // An optional require does not classify the file as CommonJS.
    assert_eq!(keys("js", "require?.('x'); require.resolve('./y');"), ("ok", vec![]));
}

#[test]
fn coerced_and_integer_like_specifiers_fall_back() {
    for (kind, source) in [
        ("ts", "import(5);"),
        ("js", "import 'm'; import(true);"),
        ("ts", "require(/re/);"),
        ("ts", "require(1n);"),
        ("js", "import 'm'; require('123');"),
    ] {
        assert_eq!(keys(kind, source), ("unsupported", vec![]), "{source}");
    }
    assert_eq!(keys("js", "import 'm'; require('01');").0, "ok");
}

#[test]
fn prototype_key_dependencies_keep_legacy_fallback() {
    for kind in ["js", "ts"] {
        for name in ["__proto__", "constructor", "toString"] {
            let source = format!("import {{ value }} from '{name}'; export {{ value }};");
            let result = scan(&fixture(kind, &source), false);
            assert_eq!(result.status, "unsupported");
            assert!(result.dependencies.is_empty());
            assert!(result.diagnostics[0].contains("prototype-key"));
        }
    }
}

#[test]
fn relative_prototype_names_and_ignored_nodes_remain_supported() {
    let result = scan(&fixture("ts", "import './toString';"), false);
    assert_eq!(result.status, "ok");
    assert!(result.dependencies.contains_key("./toString"));
    let ignored = scan(&fixture("ts", "// @bit-ignore\nimport 'constructor';"), false);
    assert_eq!(ignored.status, "ok");
    assert!(ignored.dependencies.is_empty());
}
