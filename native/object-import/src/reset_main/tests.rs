use super::{Batch, Plan, outbound, repository::object_path};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

struct Fixture {
    root: PathBuf,
    alpha: String,
}

impl Fixture {
    fn new(dependent: bool) -> Self {
        let serial = NEXT.fetch_add(1, Ordering::Relaxed);
        let root =
            std::env::temp_dir().join(format!("bit-reset-test-{}-{serial}", std::process::id()));
        fs::create_dir_all(root.join(".bit/objects")).expect("objects");
        let alpha = hash("scope/alpha");
        let first = "1111111111111111111111111111111111111111";
        let second = "2222222222222222222222222222222222222222";
        object(&root, first, "Version", &json!({"parents":[],"dependencies":[]}));
        object(&root, second, "Version", &json!({"parents":[first],"dependencies":[]}));
        object(
            &root,
            &alpha,
            "Component",
            &json!({
                "name":"alpha","scope":"scope","versions":{"1.0.0":first,"1.0.1":second},
                "state":{"versions":{"1.0.0":{"local":true},"1.0.1":{"local":true}}},
                "head":second,
            }),
        );
        let mut rows = vec![json!({"id":{"scope":"scope","name":"alpha"},"hash":alpha})];
        if dependent {
            let beta = hash("scope/beta");
            let beta_version = "3333333333333333333333333333333333333333";
            object(
                &root,
                beta_version,
                "Version",
                &json!({
                    "parents":[],"dependencies":[{"id":{"scope":"scope","name":"alpha","version":"1.0.1"}}],
                }),
            );
            object(
                &root,
                &beta,
                "Component",
                &json!({
                    "name":"beta","scope":"scope","versions":{"1.0.0":beta_version},"head":beta_version,
                }),
            );
            rows.push(json!({"id":{"scope":"scope","name":"beta"},"hash":beta}));
        }
        let mut index =
            serde_json::to_vec_pretty(&json!({"components":rows,"lanes":[]})).expect("index");
        index.push(b'\n');
        fs::write(root.join(".bit/index.json"), index).expect("write index");
        let bitmap = crate::inspection::render_bitmap(&json!({
            "alpha":{"name":"alpha","scope":"","version":"1.0.1", "defaultScope":"scope",
                "mainFile":"index.js","rootDir":"alpha"},"$schema-version":"17.0.0",
        }))
        .expect("bitmap");
        fs::write(root.join(".bitmap"), bitmap).expect("write bitmap");
        Self { root, alpha }
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.root).expect("remove fixture");
    }
}

fn hash(text: &str) -> String {
    format!("{:x}", Sha1::digest(text.as_bytes()))
}

fn object(root: &Path, hash: &str, kind: &str, value: &Value) {
    let path = object_path(root, hash);
    fs::create_dir_all(path.parent().expect("parent")).expect("object directory");
    let bytes = outbound::encode_object(hash, kind, value).expect("encode");
    fs::write(path, bytes).expect("write object");
}

#[test]
fn reset_head_rewrites_model_and_bitmap_and_refuses_a_stale_plan() {
    let fixture = Fixture::new(false);
    fs::create_dir_all(fixture.root.join(".bit/staged-config")).expect("staged directory");
    fs::write(
        fixture.root.join(".bit/staged-config/main.json"),
        serde_json::to_vec(&json!([{
            "id":{"scope":"scope","name":"alpha","version":"1.0.1"},
            "config":{"teambit.component/deprecation":{"deprecate":true,"__specific":true}},
        }]))
        .expect("staged config"),
    )
    .expect("write staged config");
    let plan = Plan::prepare(&fixture.root, "scope/alpha", true, false).expect("plan");
    let stale = Plan::prepare(&fixture.root, "scope/alpha", true, false).expect("stale plan");
    assert_eq!(plan.selection.labels, ["1.0.1"]);
    plan.commit("2026-10-15-7-17-0").expect("commit");
    let model =
        outbound::read_object(&fixture.root.join(".bit/objects"), &fixture.alpha, "Component")
            .expect("model");
    assert_eq!(model["head"], "1111111111111111111111111111111111111111");
    assert!(model["versions"].get("1.0.1").is_none());
    let bitmap =
        crate::recovery::jsonc::parse(&fs::read(fixture.root.join(".bitmap")).expect("bitmap"))
            .expect("parse bitmap");
    assert_eq!(bitmap["alpha"]["version"], "1.0.0");
    assert_eq!(
        bitmap["alpha"]["config"],
        json!({"teambit.component/deprecation":{"deprecate":true}}),
    );
    let history_hash = hash("scope/alpha:VersionHistory");
    let history =
        outbound::read_object(&fixture.root.join(".bit/objects"), &history_hash, "VersionHistory")
            .expect("history");
    assert_eq!(history["versions"][0]["hash"], "2222222222222222222222222222222222222222");
    assert!(stale.commit("2026-10-15-7-17-1").is_err());
}

#[test]
fn dependency_guard_declines_before_any_write_and_force_can_reset() {
    let fixture = Fixture::new(true);
    let before = fs::read(fixture.root.join(".bitmap")).expect("bitmap");
    assert!(Plan::prepare(&fixture.root, "scope/alpha", true, false).is_err());
    assert_eq!(fs::read(fixture.root.join(".bitmap")).expect("bitmap"), before);
    let plan = Plan::prepare(&fixture.root, "scope/alpha", true, true).expect("forced plan");
    plan.commit("2026-10-15-7-17-2").expect("forced commit");
    assert_ne!(fs::read(fixture.root.join(".bitmap")).expect("bitmap"), before);
}

#[test]
fn batch_resets_two_components_in_one_bitmap_and_index_publication() {
    let fixture = Fixture::new(true);
    let beta = hash("scope/beta");
    let mut model = outbound::read_object(&fixture.root.join(".bit/objects"), &beta, "Component")
        .expect("beta model");
    model["state"] = json!({"versions":{"1.0.0":{"local":true}}});
    object(&fixture.root, &beta, "Component", &model);
    let mut bitmap =
        crate::recovery::jsonc::parse(&fs::read(fixture.root.join(".bitmap")).expect("bitmap"))
            .expect("parse bitmap");
    bitmap["beta"] = json!({
        "name":"beta","scope":"","version":"1.0.0","defaultScope":"scope",
        "mainFile":"index.js","rootDir":"beta",
    });
    fs::write(
        fixture.root.join(".bitmap"),
        crate::inspection::render_bitmap(&bitmap).expect("render"),
    )
    .expect("write bitmap");
    let batch = Batch::prepare(&fixture.root, false).expect("batch");
    let stale = Batch::prepare(&fixture.root, false).expect("stale batch");
    assert_eq!(batch.results().count(), 2);
    batch.commit("2026-10-15-7-17-3").expect("commit batch");
    let index: Value =
        serde_json::from_slice(&fs::read(fixture.root.join(".bit/index.json")).expect("index"))
            .expect("parse index");
    assert_eq!(index["components"], json!([]));
    let bitmap =
        crate::recovery::jsonc::parse(&fs::read(fixture.root.join(".bitmap")).expect("bitmap"))
            .expect("parse bitmap");
    assert_eq!(bitmap["alpha"]["version"], "");
    assert_eq!(bitmap["beta"]["version"], "");
    assert!(!object_path(&fixture.root, &fixture.alpha).exists());
    assert!(!object_path(&fixture.root, &beta).exists());
    assert!(stale.commit("2026-10-15-7-17-4").is_err());
}
