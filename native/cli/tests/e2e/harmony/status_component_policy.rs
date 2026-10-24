//! Component policy parity with `VariantPolicy` and legacy dependency overrides.

use crate::helper::{FOO_FIXTURE, Helper, config::set_workspace_key, parse};
use serde_json::{Value, json};
use std::ffi::OsStr;

fn workspace(policy: &Value) -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.output_file(
        "bar/component.json",
        &json!({
            "componentId":{"scope":helper.scopes.remote,"name":"bar/foo"},
            "propagate":true,
            "extensions":{"teambit.dependencies/dependency-resolver":{"policy":policy}}
        })
        .to_string(),
    );
    helper
}

fn parity(helper: &Helper, command: &str) {
    let copy = helper.clone_workspace();
    let native = helper.native_run(command);
    helper.get_cloned_workspace(&copy);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert_eq!(native.status.code(), node.status.code(), "{command}");
    assert_eq!(native.stderr, node.stderr, "{command}");
    if command.contains("--json") {
        assert_eq!(parse(&native.stdout), parse(&node.stdout), "{command}");
    } else {
        assert_eq!(native.stdout, node.stdout, "{command}");
    }
}

/// Forced runtime/dev/peer entries, removals and resolve-from-env values use
/// the same status issues and diff metadata as the Node dependency loader.
#[test]
fn object_component_policy_matches_status_and_diff() {
    let helper = workspace(&json!({
        "dependencies":{"runtime-package":"^1.2.0","@types/jest":"-"},
        "devDependencies":{"dev-package":"~2.0.0"},
        "peerDependencies":{"peer-package":{"version":"^3.0.0","resolveFromEnv":true}}
    }));
    parity(&helper, "status --json");
    parity(&helper, "status");
    parity(&helper, "diff bar/foo --json");
}

/// Array policies can override only auto-detected dependencies, or force an
/// otherwise unused dependency; duplicate entries keep the first value.
#[test]
fn array_component_policy_matches_status_and_diff() {
    let helper = workspace(&json!({
        "dependencies":[
            {"name":"automatic-package","version":"^1.0.0","force":false},
            {"name":"automatic-package","version":"^9.0.0","force":true},
            {"name":"forced-package","version":"^2.0.0","force":true}
        ],
        "devDependencies":{"@types/node":"-"}
    }));
    parity(&helper, "status --json");
    parity(&helper, "diff bar/foo --json");
}

/// Auto-detected dependencies move lifecycle and change range only when the
/// configured array entry is not forced; forced additions still win last.
#[test]
fn detected_component_policy_matches_lifecycle_changes() {
    let helper = workspace(&json!({
        "dependencies":[{"name":"detected-runtime","version":"^5.0.0"}],
        "devDependencies":{"forced-dev":"~6.0.0"},
        "peerDependencies":[{"name":"detected-peer","version":"^7.0.0"}]
    }));
    for name in ["detected-runtime", "detected-peer", "forced-dev"] {
        helper.output_file(
            &format!("node_modules/{name}/package.json"),
            &json!({
                "name":name,"version":"1.0.0","main":"index.js"
            })
            .to_string(),
        );
        helper.output_file(&format!("node_modules/{name}/index.js"), "module.exports = 1;");
    }
    helper.output_file(
        "bar/foo.js",
        "module.exports = require('detected-runtime') + require('detected-peer');",
    );
    parity(&helper, "status --json");
    parity(&helper, "diff bar/foo --json");
}

/// A package forced in several lifecycles is kept only in the first entry
/// of the merged policy, while removals remain effective across lifecycles.
#[test]
fn duplicate_lifecycle_component_policy_matches_status_and_diff() {
    let helper = workspace(&json!({
        "dependencies":{"same-package":"^1.0.0","@types/jest":"-"},
        "devDependencies":{"same-package":"^2.0.0"},
        "peerDependencies":{"same-package":"^3.0.0"}
    }));
    parity(&helper, "status --json");
    parity(&helper, "diff bar/foo --json");
}

/// `bit deps set` stores a specific resolver policy in the bitmap when no
/// component.json exists, with the same forced lifecycle semantics.
#[test]
fn bitmap_component_policy_matches_status_and_diff() {
    let helper = workspace(&json!({}));
    helper.delete_path("bar/component.json");
    helper.native("deps set bar/foo runtime-package@^1.0.0");
    helper.native("deps set bar/foo dev-package@~2.0.0 --dev");
    helper.native("deps set bar/foo peer-package@^3.0.0 --peer");
    parity(&helper, "status --json");
    parity(&helper, "diff bar/foo --json");
}

/// Specific policies persisted in a Version remain active after removing
/// the component.json file that originally supplied them.
#[test]
fn stored_component_policy_matches_status_and_diff() {
    let helper = workspace(&json!({
        "dependencies":{"runtime-package":"^1.0.0"},
        "devDependencies":{"@types/node":"-"}
    }));
    helper.tag_without_build("bar/foo", r#"--ignore-issues "*""#);
    helper.delete_path("bar/component.json");
    parity(&helper, "status --json");
    parity(&helper, "diff bar/foo --json");
}

/// Workspace variants use directory and namespace specificity, exclusions,
/// and propagation before component-specific policy takes precedence.
#[test]
fn variant_component_policy_matches_status_and_diff() {
    let helper = workspace(&json!({}));
    helper.delete_path("bar/component.json");
    set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        json!({
            "*":{"teambit.dependencies/dependency-resolver":{"policy":{"dependencies":{"global-package":"1.0.0"}}}},
            "bar, !bar/excluded":{"teambit.dependencies/dependency-resolver":{"policy":{"devDependencies":{"directory-package":"2.0.0"}}}},
            "{bar/**}":{"teambit.dependencies/dependency-resolver":{"policy":{"peerDependencies":{"namespace-package":"3.0.0"}}}}
        }),
    );
    parity(&helper, "status --json");
    parity(&helper, "diff bar/foo --json");
    helper.native("deps set bar/foo specific-package@4.0.0 --dev");
    parity(&helper, "status --json");
    parity(&helper, "diff bar/foo --json");
}

/// Root policy object values use their version for detection, while preserve
/// flags remain configuration-only and root package.json keeps precedence.
#[test]
fn root_policy_object_values_match_status_and_diff() {
    let helper = workspace(&json!({}));
    helper.delete_path("bar/component.json");
    set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        json!({
            "policy":{"dependencies":{"detected-runtime":{"version":"^5.0.0","preserve":true}},
                "peerDependencies":{"detected-peer":{"version":"^7.0.0","preserve":false}}}
        }),
    );
    for name in ["detected-runtime", "detected-peer"] {
        helper.output_file(
            &format!("node_modules/{name}/package.json"),
            &json!({
                "name":name,"version":"1.0.0","main":"index.js"
            })
            .to_string(),
        );
        helper.output_file(&format!("node_modules/{name}/index.js"), "module.exports = 1;");
    }
    helper.output_file(
        "bar/foo.js",
        "module.exports = require('detected-runtime') + require('detected-peer');",
    );
    parity(&helper, "status --json");
    parity(&helper, "diff bar/foo --json");
}

/// A resolved merge-conflict entry participates in aspect policy while
/// non-forced dependency entries remain automatic detection overrides.
#[test]
fn resolved_merge_config_policy_matches_status_and_diff() {
    let helper = workspace(&json!({}));
    helper.delete_path("bar/component.json");
    helper.output_file(
        "merge-conflict",
        &format!(
            "[*] {}/bar/foo\n{}",
            helper.scopes.remote,
            json!({
                "teambit.dependencies/dependency-resolver":{"policy":{
                    "dependencies":[{"name":"automatic-package","version":"1.0.0"}],
                    "devDependencies":[{"name":"forced-package","version":"2.0.0","force":true}]
                }}
            }),
        ),
    );
    parity(&helper, "status --json");
    parity(&helper, "diff bar/foo --json");
}

/// Unresolved merge markers become the same boolean `MergeConfigHasConflict`
/// issue instead of delegating the complete status command.
#[test]
fn unresolved_merge_config_matches_status_issue() {
    let helper = workspace(&json!({}));
    helper.delete_path("bar/component.json");
    helper.output_file(
        "merge-conflict",
        &format!(
            "[*] {}/bar/foo\n<<<<<<< local\n{{}}\n=======\n{{}}\n>>>>>>> incoming\n",
            helper.scopes.remote,
        ),
    );
    parity(&helper, "status --json");
    parity(&helper, "status");
}

/// Global and component-specific issue ignores are combined after all
/// issues are computed, including configuration inherited from variants.
#[test]
fn component_issue_ignores_match_status_and_diff() {
    let helper = workspace(&json!({}));
    helper.output_file("bar/component.json", &json!({
        "componentId":{"scope":helper.scopes.remote,"name":"bar/foo"},"propagate":true,
        "extensions":{"teambit.component/issues":{"ignoreIssues":["MissingPackagesDependenciesOnFs"]}}
    }).to_string());
    set_workspace_key(
        &helper.scopes.local_path,
        "teambit.component/issues",
        json!({"ignoreIssues":["MissingDists"]}),
    );
    helper.output_file("bar/foo.js", "module.exports = require('missing-package-for-issue');");
    parity(&helper, "status --json");
    parity(&helper, "status");
    parity(&helper, "diff bar/foo --json");
    helper.delete_path("bar/component.json");
    set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        json!({
            "{bar/**}":{"teambit.component/issues":{"ignoreIssues":["MissingPackagesDependenciesOnFs"]}}
        }),
    );
    parity(&helper, "status --json");
}

/// Installation and workspace presentation options do not divert VCS reads.
#[test]
fn workspace_and_install_metadata_match_status_and_diff() {
    let helper = workspace(&json!({}));
    let root = &helper.scopes.local_path;
    set_workspace_key(
        root,
        "teambit.workspace/workspace",
        json!({
            "defaultScope":helper.scopes.remote,"defaultDirectory":"components/{name}",
            "name":"native fixture","icon":"https://example.com/icon.svg",
            "rootComponentsDirectory":"node_modules/.custom_roots","autoLoadAspectsDeps":true,
            "externalPackageManager":true,"trustedScopes":["teambit.*"],
        }),
    );
    set_workspace_key(
        root,
        "teambit.dependencies/dependency-resolver",
        json!({
            "packageManager":"teambit.dependencies/pnpm","nodeLinker":"isolated",
            "linkCoreAspects":false,"savePrefix":"~","sideEffectsCache":true,
            "overrides":{"lodash":"4.17.21"},"packageManagerArgs":["--offline"],
        }),
    );
    set_workspace_key(
        root,
        "teambit.preview/preview",
        json!({"disabled":true,"maxChunkSize":10,"onlyOverview":true}),
    );
    set_workspace_key(
        root,
        "teambit.pkg/pkg",
        json!({"avoidPublishToNPM":true,"packageManagerPublishArgs":["--dry-run"]}),
    );
    let path = root.join("bar/component.json");
    let mut component = crate::helper::config::read_jsonc(&path);
    component["extensions"]["teambit.preview/preview"] = json!({"isScaling":true});
    component["extensions"]["teambit.pkg/pkg"] =
        json!({"packageJson":{"description":"native metadata"}});
    crate::helper::config::write_json(&path, &component, b"  ");
    crate::helper::config::update_scope_json(&root.join(".bit/scope.json"), |scope| {
        scope.insert("license".into(), json!("MIT"));
        scope.insert("icon".into(), json!("https://example.com/icon.svg"));
    });
    for command in ["status --json", "status", "diff bar/foo --json"] {
        parity(&helper, command);
    }
}
