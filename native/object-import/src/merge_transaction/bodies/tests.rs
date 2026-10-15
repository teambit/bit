use super::{json, prepare_response};
use flate2::{Compression, write::ZlibEncoder};
use sha1::{Digest, Sha1};
use std::{fs, io::Write};
fn packed(kind: &str, hash: &str, body: &[u8]) -> Vec<u8> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {hash} {}\0", body.len()).unwrap();
    encoder.write_all(body).unwrap();
    encoder.finish().unwrap()
}
#[test]
fn freshly_imported_added_file_retains_merge_source_receipt_without_publication() {
    let directory =
        std::env::temp_dir().join(format!("bit-overlay-merge-receipt-{}", std::process::id()));
    fs::create_dir(&directory).unwrap();
    let body = b"module.exports = 'new';\n";
    let hash = crate::validate::hexadecimal(&Sha1::digest(body));
    let target = "a".repeat(40);
    let base = "b".repeat(40);
    let version = json!({"files":[{"relativePath":"new.js","file":hash}]});
    let empty = json!({"files":[]});
    let overlay = crate::command_import::tests::test_overlay(vec![
        (hash.clone(), "Source".into(), packed("Source", &hash, body), None),
        (
            target.clone(),
            "Version".into(),
            packed("Version", &target, &serde_json::to_vec(&version).unwrap()),
            Some(version),
        ),
        (
            base.clone(),
            "Version".into(),
            packed("Version", &base, &serde_json::to_vec(&empty).unwrap()),
            Some(empty),
        ),
    ]);
    let input = json!({"objectsDirectory":directory.join("unpublished-objects"),"snapshotDirectory":directory,"target":{"hash":target,"files":[{"relativePath":"new.js","hash":hash}]},"base":{"hash":base,"files":[]},"current":[],"labels":{"current":"current","other":"incoming"}});
    let mut state = crate::checkout_transition::State::default();
    let output = prepare_response(&input, &mut state, None, Some(&overlay)).unwrap();
    assert_eq!(output["sources"][0]["hash"], hash);
    assert_eq!(output["sources"][0]["bodySize"], body.len());
    assert!(!directory.join("unpublished-objects").exists());
    crate::checkout_transition::apply(
        "checkoutFinish",
        json!({"token":output["token"]}),
        &mut state,
    )
    .unwrap();
    fs::remove_dir_all(directory).unwrap();
}
