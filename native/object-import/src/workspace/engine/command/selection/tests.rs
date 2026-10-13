use super::{Options, Repository, Selection, select};
use serde_json::{Value, json};
use std::path::Path;

fn options(to: &str) -> Options {
    serde_json::from_value(json!({"to":to,"skipDependencyInstallation":true})).unwrap()
}

fn skipped(to: &str, model: Option<&Value>, version: &str, semver: &Value) -> Value {
    let target = json!({"identity":"scope/alpha","version":version});
    let selection = Selection {
        target: &target,
        model,
        modified: false,
        merge_pending: false,
        remote_head: None,
        semver,
    };
    select(
        &options(to),
        &selection,
        &mut Repository::new(Path::new("/unused"), None),
        &mut crate::checkout_transition::State::default(),
    )
    .unwrap()
}

#[test]
fn reset_clean_and_new_components_use_existing_selection_messages() {
    let model = json!({"head":"a".repeat(40),"versions":{"1.0.0":"a".repeat(40)}});
    let reset = skipped("reset", Some(&model), "1.0.0", &json!({}));
    assert_eq!(reset["message"], "component scope/alpha is not modified");
    assert!(
        !reset["observations"]
            .as_array()
            .unwrap()
            .contains(&json!("mergePending")),
    );
    assert_eq!(
        skipped("head", None, "", &json!({}))["message"],
        "component scope/alpha is new, no version to checkout",
    );
}

#[test]
fn latest_uses_semver_grammar_and_excludes_orphaned_tags() {
    let model = json!({"head":"a".repeat(40),"versions":{"1.2.0":"a".repeat(40),"1.10.0":"b".repeat(40)},
        "orphanedVersions":{"9.0.0":"c".repeat(40)}});
    let grammar = json!({"1.2.0":{"version":{"major":1,"minor":2,"patch":0,"prerelease":[]}},
        "1.10.0":{"version":{"major":1,"minor":10,"patch":0,"prerelease":[]}}});
    assert_eq!(
        skipped("latest", Some(&model), "1.10.0", &grammar)["message"],
        "component scope/alpha is already at the latest version, which is 1.10.0",
    );
}

#[test]
fn head_names_use_last_regular_tag_before_orphaned_tag() {
    let hash = "a".repeat(40);
    let model = json!({"head":hash,"versions":{"1.0.0":hash,"2.0.0":hash},"orphanedVersions":{"3.0.0":hash}});
    assert_eq!(
        skipped("head", Some(&model), "2.0.0", &json!({}))["message"],
        "component scope/alpha is already at the latest version, which is 2.0.0",
    );
}

#[test]
fn divergent_head_resolves_remote_before_rejecting_merge_pending() {
    let directory = super::super::scratch::Directory::create().unwrap();
    let local = "a".repeat(40);
    let remote = "b".repeat(40);
    let base = "c".repeat(40);
    for (hash, parents) in [(&local, vec![&base]), (&remote, vec![&base]), (&base, vec![])] {
        store_version(&directory.0, hash, &json!({"parents":parents}));
    }
    let model = json!({"head":local,"versions":{"2.0.0":local,"1.0.1":remote}});
    let target = json!({"identity":"scope/alpha","version":"2.0.0"});
    let selection = Selection {
        target: &target,
        model: Some(&model),
        modified: false,
        merge_pending: true,
        remote_head: Some(&remote),
        semver: &Value::Null,
    };
    let selected = select(
        &options("head"),
        &selection,
        &mut Repository::new(&directory.0, None),
        &mut crate::checkout_transition::State::default(),
    )
    .unwrap();
    assert_eq!(selected["legitimate"], false);
    assert!(
        selected["message"]
            .as_str()
            .unwrap()
            .contains("merge-pending"),
    );
    assert!(
        selected["observations"]
            .as_array()
            .unwrap()
            .contains(&json!("mergePending")),
    );
}
fn store_version(root: &Path, hash: &str, value: &Value) {
    use std::io::Write;
    let body = serde_json::to_vec(value).unwrap();
    let mut encoder = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    encoder
        .write_all(format!("Version {hash} {}\0", body.len()).as_bytes())
        .unwrap();
    encoder.write_all(&body).unwrap();
    let path = root
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, encoder.finish().unwrap()).unwrap();
}
