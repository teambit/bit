//! Upstream [PR 10846](https://github.com/teambit/bit/pull/10846) adds one main-model backup to these otherwise unchanged installer fixtures.
//! The 2.2.146 reference lacks this addition; assert the Node-written pre-merge object verbatim.
use crate::helper::Helper;
use sha1::{Digest, Sha1};
use std::{collections::BTreeMap, fs};

pub(super) fn expected(helper: &Helper) -> BTreeMap<String, Vec<u8>> {
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    let hash = format!("{:x}", Sha1::digest(format!("{}/comp1", helper.scopes.remote).as_bytes()));
    let path = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let bytes = fs::read(&path).unwrap();
    let (kind, model) = bit_object_import::read_scope_object(&scope, &hash).unwrap().unwrap();
    assert_eq!(kind, "Component");
    assert_eq!(model["name"], "comp1");
    assert_eq!(model["head"], helper.head("comp1"));
    BTreeMap::from([
        (
            "last-merged/main-components/".into(),
            mode(&fs::metadata(path.parent().unwrap()).unwrap()),
        ),
        ("last-merged/main-components/0".into(), bytes),
        ("last-merged/main-components/0:mode".into(), mode(&fs::metadata(path).unwrap())),
    ])
}
fn mode(metadata: &fs::Metadata) -> Vec<u8> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata
            .permissions()
            .mode()
            .to_le_bytes()
            .to_vec()
    }
    #[cfg(not(unix))]
    {
        vec![u8::from(metadata.permissions().readonly())]
    }
}
