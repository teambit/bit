use super::super::Prepared;
use crate::workspace::engine::command::scratch::Directory;
use serde_json::json;
use std::fs;

fn prepared(directory: &Directory) -> Prepared {
    let manifest = json!({"name":"@scope/alpha","version":"0.0.1","componentId":{"scope":"scope","name":"alpha","version":"0.0.1"},"dependencies":{},"source":"index.js","_bit_local":true});
    Prepared {
        proofs: Vec::new(),
        writes: vec![(
            directory.0.join("node_modules/@scope/alpha/package.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )],
        links: Vec::new(),
        copies: Vec::new(),
        package_creates: vec![directory.0.join("node_modules/@scope/alpha/package.json")],
    }
}

#[test]
fn canonical_package_metadata_changes_remain_pending_until_native_commit() {
    let directory = Directory::create().unwrap();
    let mut prepared = prepared(&directory);
    let mut plans = prepared.package_manifest_plans().unwrap();
    plans[0]["manifest"]["customEnv"] = json!(true);
    prepared.package_manifests(&plans).unwrap();
    assert!(!directory.0.join("node_modules").exists());
    prepared.commit().unwrap();
    let value: serde_json::Value = serde_json::from_slice(
        &fs::read(directory.0.join("node_modules/@scope/alpha/package.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(value, plans[0]["manifest"]);
    assert!(!directory.0.join(".bit/objects").exists());
}

#[test]
fn package_receipts_bind_owned_paths_but_allow_canonical_callback_metadata_overrides() {
    let directory = Directory::create().unwrap();
    let mut prepared = prepared(&directory);
    let plans = prepared.package_manifest_plans().unwrap();
    let mut changed = plans.clone();
    changed[0]["manifest"]["version"] = json!("latest");
    changed[0]["manifest"]["componentId"]["name"] = json!("metadata-only-override");
    prepared.package_manifests(&changed).unwrap();
    let value: serde_json::Value = serde_json::from_slice(&prepared.writes[0].1).unwrap();
    assert_eq!(value["version"], "0.0.1-new");
    assert_eq!(value["componentId"]["name"], "metadata-only-override");
    let mut invalid = plans.clone();
    invalid[0]["identity"] = json!("scope/other");
    assert!(prepared.package_manifests(&invalid).is_err());
    assert!(prepared.package_manifests(&[]).is_err());
    assert!(
        prepared
            .package_manifests(&[plans[0].clone(), plans[0].clone()])
            .is_err(),
    );
    assert!(!directory.0.join("node_modules").exists());
}

#[test]
fn post_transform_snap_versions_use_node_package_semver_prefix() {
    let original = json!({"source":"index.js","_bit_local":true});
    let value =
        super::normalize(json!({"version":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}), &original)
            .unwrap();
    assert_eq!(value["version"], "0.0.0-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
}

#[test]
fn aspect_exports_insert_types_before_a_truthy_default_and_preserve_existing_types() {
    let mut manifest = json!({"types":"index.d.ts","exports":{".":{"require":"./index.js","default":"./index.js"}}});
    super::aspect_exports(&mut manifest).unwrap();
    assert_eq!(
        serde_json::to_string(&manifest["exports"]["."]).unwrap(),
        r#"{"require":"./index.js","types":"./index.d.ts","default":"./index.js"}"#,
    );
    manifest["types"] = json!("other.d.ts");
    super::aspect_exports(&mut manifest).unwrap();
    assert_eq!(manifest["exports"]["."]["types"], "./index.d.ts");
}

#[test]
fn short_callback_hash_versions_follow_the_published_version_parser() {
    let original = json!({"source":"index.js"});
    let value = super::normalize(json!({"version":"abc"}), &original).unwrap();
    assert_eq!(value["version"], "0.0.0-abc");
    let value = super::normalize(json!({"version":"ABC"}), &original).unwrap();
    assert_eq!(value["version"], "0.0.0-ABC");
    let value = super::normalize(json!({"version":"ab"}), &original).unwrap();
    assert_eq!(value["version"], "ab");
}

#[test]
fn windows_types_restore_preserves_absent_null_and_native_source_path() {
    for original in [json!({}), json!({"types":null}), json!({"types":"_src/index.ts"})] {
        let mut manifest = json!({"types":"callback.d.ts","custom":true});
        super::platform_types(&mut manifest, &original, false);
        assert_eq!(manifest["types"], "callback.d.ts");
        super::platform_types(&mut manifest, &original, true);
        assert_eq!(manifest.get("types"), original.get("types"));
        assert_eq!(manifest["custom"], true);
    }
}
