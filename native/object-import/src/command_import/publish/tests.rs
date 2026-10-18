//! Preserve the exact validated Node stream; compressors may emit different valid encodings.
use serde_json::Value;
const HASH: &str = "1916562e4f80016ca7cfb37975c8257ab52506d8";
const BODY: &str = r#"{"name":"comp-a2","scope":"25412c31-remote","versions":{"0.0.1":"173108081623a641493cb6a1c777c4d7d01d04a0"},"lang":"javascript","deprecated":false,"bindingPrefix":"@25412c31-remote","remotes":[{"url":"file:///var/tmp/bit-native-e2e/3972936/case-AkphF3/25412c31-remote","name":"25412c31-remote","date":"1792308099002"}],"schema":"2.0.0","head":"173108081623a641493cb6a1c777c4d7d01d04a0"}"#;
const GOLDEN: &str = concat!(
    "789c9590b14ec4301044f994d3d6c9796d2776ec0a84444d8f2836f6e6ce9038516222a413ff8e0ee8aea21bcd",
    "6846bbef719e9639732e07e9a4698de266e810a50964c3d06beb6c1b3ad55aea5bd5a289dd4177e6ee02992606",
    "0f619e969a1454b08579b93aaa6da40a5ad62b4f7361a860e7754b73dec05f008f7894e0415a2db1c34e1aa5c9",
    "34b2713af48664b0d68626da88326243085f158c944fe0e18d76dac29a960215445e560e5438821f68dcb8823e",
    "e598f2e979e5217d8287fbdb4b7ec506fee5021feb081e8634b21742ecb48a322da24fa5ce54d2ce352b16da59",
    "e5b4118136ae1fde97f39316b7b37f2c6e8348857f9e754a6387ce212af87abdc23af344d7ce118f08159c99e2",
    "bfb07c039a697e77",
);

#[test]
fn unchanged_remote_component_preserves_all_captured_compressed_bytes() {
    let directory = tempfile::tempdir().unwrap();
    let mut capture = super::super::Capture::default();
    let incoming = captured(directory.path(), &mut capture);
    let bytes = incoming.bytes.clone();
    let value = incoming.value.clone().unwrap();
    let result = super::reusing(HASH, "Component", value.clone(), Some(incoming)).unwrap();
    assert_eq!(result.bytes, bytes);
    assert_eq!(result.value, Some(value));
    capture.validate().unwrap();
    std::fs::write(
        directory
            .path()
            .join(&HASH[..2])
            .join(&HASH[2..]),
        b"changed",
    )
    .unwrap();
    assert!(capture.validate().is_err());
}

#[test]
fn changed_remote_component_is_serialized_instead_of_reusing_the_old_stream() {
    let directory = tempfile::tempdir().unwrap();
    let mut capture = super::super::Capture::default();
    let incoming = captured(directory.path(), &mut capture);
    let before = incoming.bytes.clone();
    let mut value: Value = serde_json::from_str(BODY).unwrap();
    value["deprecated"] = Value::Bool(true);
    let result = super::reusing(HASH, "Component", value.clone(), Some(incoming)).unwrap();
    assert_ne!(result.bytes, before);
    assert_eq!(
        crate::checkout::repository::inflate(&result.bytes, 32 * 1024 * 1024).unwrap(),
        super::serialized(HASH, "Component", &value).unwrap(),
    );
}

#[test]
fn equal_json_with_different_key_order_does_not_reuse_the_stream() {
    let directory = tempfile::tempdir().unwrap();
    let mut capture = super::super::Capture::default();
    let incoming = captured(directory.path(), &mut capture);
    let before = incoming.bytes.clone();
    let mut value = incoming.value.clone().unwrap();
    let object = value.as_object_mut().unwrap();
    let name = object.shift_remove("name").unwrap();
    object.insert("name".into(), name);
    let result = super::reusing(HASH, "Component", value.clone(), Some(incoming)).unwrap();
    assert_ne!(result.bytes, before);
    assert_eq!(
        crate::checkout::repository::inflate(&result.bytes, 32 * 1024 * 1024).unwrap(),
        super::serialized(HASH, "Component", &value).unwrap(),
    );
}

fn captured(path: &std::path::Path, capture: &mut super::super::Capture) -> super::Object {
    let bytes = GOLDEN
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
        .collect::<Vec<_>>();
    std::fs::create_dir(path.join(&HASH[..2])).unwrap();
    std::fs::write(path.join(&HASH[..2]).join(&HASH[2..]), bytes).unwrap();
    capture
        .object(path, HASH, "Component")
        .unwrap()
        .unwrap()
}
