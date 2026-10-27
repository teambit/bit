use super::{Fixture, object_hash, publish};
use std::fs;

#[test]
fn restored_models_are_verified_and_not_replayed_by_the_pending_import() {
    let fixture = Fixture::new();
    fixture.model(&"a".repeat(40));
    let mut plan = fixture.imported();
    let hash = object_hash("remote.scope/alpha");
    let mut value = plan.overlay
        .read(&hash, "Component")
        .unwrap()
        .unwrap()
        .clone();
    value["head"] = serde_json::json!("b".repeat(40));
    let restored = publish::object(&hash, "Component", value).unwrap();
    let store = crate::store::Store::new(fixture.root.join(".bit/objects"), None).unwrap();
    store.write(&hash, &restored.bytes).unwrap();
    assert!(
        plan.accept_recovery_objects(&fixture.root, &[(hash.clone(), b"wrong".to_vec())])
            .is_err(),
    );
    plan.accept_recovery_objects(&fixture.root, &[(hash.clone(), restored.bytes.clone())])
        .unwrap();
    plan.commit().unwrap();
    let path = fixture.root
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    assert_eq!(fs::read(&path).unwrap(), restored.bytes);
    fs::write(path, b"later race").unwrap();
    assert!(plan.validate().is_err());
}
