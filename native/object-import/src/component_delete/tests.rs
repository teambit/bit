use super::{Batch, Scope, outbound};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
fn fixture() -> PathBuf {
    let root = std::env::temp_dir()
        .join(format!(
            "bit-delete-batch-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
    fs::create_dir_all(root.join(".bit/objects")).unwrap();
    let mut bitmap = json!({"$schema-version":"17.0.0"});
    let mut models = Vec::new();
    for (name, prefix) in [("alpha", "a"), ("beta", "b")] {
        fs::create_dir_all(root.join(name)).unwrap();
        fs::write(root.join(name).join("index.js"), "module.exports=1;").unwrap();
        fs::create_dir_all(root.join("node_modules/@scope").join(name)).unwrap();
        let model = prefix.repeat(40);
        let version = if name == "alpha" { "c" } else { "d" }.repeat(40);
        object(&root, &version, "Version", &json!({"mainFile":"index.js"}));
        object(
            &root,
            &model,
            "Component",
            &json!({"scope":"scope","name":name,"head":version,"versions":{"0.0.1":version}}),
        );
        models.push(json!({"id":{"scope":"scope","name":name},"hash":model,"isSymlink":false}));
        bitmap[name] = json!({"name":name,"scope":"","defaultScope":"scope","version":"0.0.1","mainFile":"index.js","rootDir":name,"config":{"teambit.pkg/pkg":{"packageJson":{"description":"kept"}}}});
    }
    fs::write(
        root.join(".bit/index.json"),
        serde_json::to_vec(&json!({"components":models,"lanes":[]})).unwrap(),
    )
    .unwrap();
    fs::write(root.join(".bitmap"), crate::inspection::render_workspace_bitmap(&bitmap).unwrap())
        .unwrap();
    root
}
fn object(root: &std::path::Path, hash: &str, kind: &str, value: &Value) {
    let path = root
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, outbound::encode_object(hash, kind, value).unwrap()).unwrap();
}
#[test]
fn one_batch_preserves_unrelated_config_and_repository_objects() {
    let root = fixture();
    let index = fs::read(root.join(".bit/index.json")).unwrap();
    let plan = Batch::prepare(
        &root,
        &["scope/alpha".into(), "scope/beta".into()],
        &Scope::Entire,
        false,
        false,
        None,
    )
    .unwrap();
    plan.commit("2026-10-18-12-0-0").unwrap();
    let map = crate::parse_jsonc(&fs::read(root.join(".bitmap")).unwrap()).unwrap();
    assert_eq!(map["alpha"]["config"]["teambit.pkg/pkg"]["packageJson"]["description"], "kept");
    assert_eq!(map["beta"]["config"]["teambit.component/remove"]["removed"], true);
    assert_eq!(fs::read(root.join(".bit/index.json")).unwrap(), index);
    assert!(!root.join("alpha").exists());
    assert!(!root.join("node_modules/@scope/beta").exists());
    assert_eq!(
        fs::read_to_string(root.join(".bit/bitmap-history-metadata.txt")).unwrap(),
        "2026-10-18-12-0-0 delete\n",
    );
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn changed_repository_prevents_every_package_and_bitmap_write() {
    let root = fixture();
    let bitmap = fs::read(root.join(".bitmap")).unwrap();
    let plan =
        Batch::prepare(&root, &["scope/alpha".into()], &Scope::Entire, false, false, None).unwrap();
    fs::write(root.join(".bit/index.json"), "{}").unwrap();
    assert!(plan.commit("2026-10-18-12-0-0").is_err());
    assert!(root.join("node_modules/@scope/alpha").is_dir());
    assert!(root.join("alpha/index.js").is_file());
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), bitmap);
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn range_and_update_main_preserve_packages_and_source_files() {
    let root = fixture();
    Batch::prepare(
        &root,
        &["scope/alpha".into()],
        &Scope::Range("<1.0.0".into()),
        false,
        true,
        None,
    )
    .unwrap()
    .commit("2026-10-18-12-0-0")
    .unwrap();
    let map = crate::parse_jsonc(&fs::read(root.join(".bitmap")).unwrap()).unwrap();
    assert_eq!(
        map["alpha"]["config"]["teambit.component/remove"],
        json!({"removed":false,"removeOnMain":true,"range":"<1.0.0"}),
    );
    assert!(root.join("alpha/index.js").is_file());
    assert!(root.join("node_modules/@scope/alpha").is_dir());
    fs::remove_dir_all(root).unwrap();
}
