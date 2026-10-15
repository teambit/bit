use super::{proof, retain, snapshots};
use serde_json::json;

#[test]
fn captured_bom_source_remains_bound_until_publication() {
    let root = crate::workspace::engine::command::scratch::Directory::create().unwrap();
    let path = root.0.join("index.js");
    let raw = b"\xef\xbb\xbfexports.value = 1;\r\n";
    std::fs::write(&path, raw).unwrap();
    let hash = crate::workspace::engine::hash(raw);
    let mut snapshots = snapshots::State::default();
    let token = snapshots
        .retain(snapshots::Observation {
            path: path.clone(),
            raw_hash: hash.clone(),
            snapshot_hash: crate::workspace::engine::hash(&raw[3..]),
            raw_bytes: raw.len(),
            contents: raw[3..].to_vec().into(),
        })
        .unwrap();
    let retained =
        retain(&json!({"path":path,"rawHash":hash,"readToken":token}), &snapshots).unwrap();
    proof::verify(std::slice::from_ref(&retained)).unwrap();
    std::fs::write(&path, b"exports.value = 2;\n").unwrap();
    assert!(proof::verify(&[retained]).is_err());
}
