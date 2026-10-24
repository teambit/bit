use super::{Fixture, object_hash, prepare_cached, publish};
use flate2::{Compression, write::ZlibEncoder};
use std::{fs, io::Write};

#[test]
fn equal_head_main_refresh_canonicalizes_both_alternative_streams_without_fetching_sources() {
    let fixture = Fixture::new();
    let head = "a".repeat(40);
    fixture.model(&head);
    fixture.imported().commit().unwrap();
    let hash = object_hash("remote.scope/alpha");
    let relative = std::path::Path::new(&hash[..2]).join(&hash[2..]);
    let local = fixture.root.join(".bit/objects").join(&relative);
    let remote = fixture.remote.join("objects").join(&relative);
    let original = fs::read(&remote).unwrap();
    let raw = crate::checkout::repository::inflate(&original, 32768).unwrap();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(&raw).unwrap();
    let alternative = encoder.finish().unwrap();
    assert_ne!(alternative, original);
    fs::write(&local, &alternative).unwrap();
    fs::write(&remote, &alternative).unwrap();
    let mut plan = prepare_cached(&fixture.root, &fixture.global).unwrap();
    plan.refresh_lane_main(&["remote.scope/alpha".into()])
        .unwrap();
    let model = plan.overlay
        .read(&hash, "Component")
        .unwrap()
        .unwrap()
        .clone();
    assert_eq!(
        plan.overlay.objects[&hash].bytes,
        publish::object(&hash, "Component", model).unwrap().bytes,
    );
    assert!(!plan.overlay.objects.contains_key(&head));
    assert_eq!(plan.progress[0].ids, vec!["remote.scope/alpha@latest"]);
    assert_eq!(plan.progress[0].components.len(), 1);
    assert_eq!(plan.progress[0].objects.len(), 1);
    plan.commit().unwrap();
    assert_eq!(fs::read(local).unwrap(), original);
    assert_eq!(fs::read(remote).unwrap(), alternative);
}

pub(super) fn alternative(compressed: &[u8], compression: Compression) -> Vec<u8> {
    let raw = crate::checkout::repository::inflate(compressed, 32768).unwrap();
    let mut encoder = ZlibEncoder::new(Vec::new(), compression);
    encoder.write_all(&raw).unwrap();
    encoder.finish().unwrap()
}

pub(super) fn point_main_at(fixture: &Fixture, head: &str) {
    let refs = fixture.root.join(".bit/refs/remotes/remote.scope/main");
    fs::create_dir_all(refs.parent().unwrap()).unwrap();
    fs::write(
        &refs,
        serde_json::to_vec(
            &serde_json::json!([{"id":{"scope":"remote.scope","name":"alpha"},"head":head}]),
        )
        .unwrap(),
    )
    .unwrap();
}
