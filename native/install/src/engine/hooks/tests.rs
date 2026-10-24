use super::{BitHooks, normalize};
use pnpm_hooks::{HookContext, PnpmfileHooks};
use pretty_assertions::assert_eq;
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

fn hooks() -> BitHooks {
    BitHooks { root: PathBuf::from("/ws"), ..BitHooks::default() }
}

#[test]
fn legacy_and_harmony_are_removed_unless_linked() {
    let manifest = json!({
        "dependencies": { "@teambit/legacy": "1.0.0", "@teambit/harmony": "link:/bvm/harmony", "a": "1" },
        "peerDependencies": { "@teambit/legacy": "*", "@teambit/harmony": "*" },
    });
    assert_eq!(
        hooks().apply(manifest, None),
        json!({
            "dependencies": { "@teambit/harmony": "link:/bvm/harmony", "a": "1" },
            "peerDependencies": {},
        }),
    );
}

#[test]
fn a_forced_harmony_version_is_kept() {
    let hooks = BitHooks { forced_harmony: true, ..hooks() };
    let manifest = json!({ "dependencies": { "@teambit/harmony": "0.4.6" } });
    assert_eq!(hooks.apply(manifest.clone(), None), manifest);
}

#[test]
fn root_components_drop_workspace_deps_of_workspace_projects() {
    let hooks = BitHooks { root_components: true, ..hooks() };
    let manifest = json!({
        "dependencies": { "comp": "workspace:*", "a": "1" },
        "peerDependencies": { "react": "^18", "a": "2" },
    });
    assert_eq!(
        hooks.apply(manifest.clone(), Some(Path::new("/ws/comp"))),
        json!({
            "dependencies": { "react": "^18", "a": "1" },
            "peerDependencies": { "react": "^18", "a": "2" },
        }),
    );
    // `.bit_roots` projects and dependencies keep them.
    assert_eq!(
        hooks.apply(manifest.clone(), Some(Path::new("/ws/node_modules/.bit_roots/env"))),
        manifest,
    );
    assert_eq!(hooks.apply(manifest.clone(), None), manifest);
}

#[test]
fn an_injected_project_gets_its_raw_manifest() {
    let raw = json!({ "name": "comp", "dependencies": { "sibling": "workspace:*" } });
    let hooks = BitHooks {
        root_components: true,
        raw_manifests: std::collections::HashMap::from([(
            PathBuf::from("/ws/comps/comp"),
            raw.clone(),
        )]),
        ..hooks()
    };
    let hooked = json!({ "name": "comp", "dependencies": {} });
    assert_eq!(hooks.dependency_manifest(hooked, Some("comps/comp")), raw);
}

#[test]
fn never_built_packages_lose_their_scripts() {
    let hooks = BitHooks { never_build: vec!["x".to_string()], ..hooks() };
    let manifest = json!({ "name": "x", "scripts": { "install": "node i.js" } });
    assert_eq!(hooks.dependency_manifest(manifest, None), json!({ "name": "x" }));
    let other = json!({ "name": "y", "scripts": { "install": "node i.js" } });
    assert_eq!(hooks.dependency_manifest(other.clone(), None), other);
}

#[test]
fn normalize_resolves_dot_segments() {
    assert_eq!(normalize(Path::new("/ws/a/../b/./c")), PathBuf::from("/ws/b/c"));
}

#[tokio::test]
async fn the_hooks_are_tracked_by_bits_checksum() {
    let hooks: Arc<dyn PnpmfileHooks> = Arc::new(hooks());
    assert_eq!(hooks.calculate_pnpmfile_checksum().await.as_deref(), Some("bit-1"));
    assert_eq!(hooks.untracked_read_package_hook().await.expect("untracked"), None);
    assert!(hooks.has_read_package().await.expect("has read package"));
    let context = HookContext { log: Arc::new(|_| {}), dir: None };
    let transformed = hooks
        .read_package(json!({ "dependencies": { "@teambit/legacy": "1" } }), context)
        .await
        .expect("read");
    assert_eq!(*transformed, json!({ "dependencies": {} }));
    let lockfile =
        hooks.after_all_resolved(json!({}), HookContext { log: Arc::new(|_| {}), dir: None }).await;
    assert_eq!(lockfile.expect("after all resolved"), Value::Null);
}
