//! Incoming Source capture retains the validated wire representation.
use super::Capture;
use flate2::{Compression, write::ZlibEncoder};
use sha1::{Digest, Sha1};
use std::{fs, io::Write, path::Path};

fn source(body: &[u8], compression: Compression) -> (String, Vec<u8>) {
    let hash = crate::validate::hexadecimal(&Sha1::digest(body));
    let mut encoder = ZlibEncoder::new(Vec::new(), compression);
    write!(encoder, "Source {hash} {}\0", body.len()).unwrap();
    encoder.write_all(body).unwrap();
    (hash, encoder.finish().unwrap())
}
fn object_path(directory: &Path, hash: &str) -> std::path::PathBuf {
    directory
        .join(&hash[..2])
        .join(&hash[2..])
}
#[test]
fn file_and_virtual_sources_preserve_received_compressed_bytes() {
    let root = tempfile::tempdir().unwrap();
    let file_remote = root.path().join("file-remote");
    let virtual_remote = root.path().join("virtual-remote");
    let output = root.path().join("local");
    let body = b"repeated-source-content repeated-source-content repeated-source-content\n";
    let (hash, compressed) = source(body, Compression::none());
    let (_, default) = source(body, Compression::default());
    assert_ne!(compressed, default);
    let path = object_path(&file_remote, &hash);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, &compressed).unwrap();
    let mut file_capture = Capture::default();
    let file = file_capture
        .sources(&file_remote, std::slice::from_ref(&hash))
        .unwrap()
        .pop()
        .unwrap()
        .1;
    let mut virtual_capture = Capture::default();
    virtual_capture
        .virtual_file(object_path(&virtual_remote, &hash), compressed.clone())
        .unwrap();
    let virtual_file = virtual_capture
        .sources(&virtual_remote, std::slice::from_ref(&hash))
        .unwrap()
        .pop()
        .unwrap()
        .1;
    assert_eq!(file.bytes, compressed);
    assert_eq!(virtual_file.bytes, compressed);
    assert_eq!(virtual_file.source.as_deref(), Some(body.as_slice()));
    let store = crate::store::Store::new(output.clone(), None).unwrap();
    store.write(&hash, &virtual_file.bytes).unwrap();
    assert_eq!(fs::read(object_path(&output, &hash)).unwrap(), compressed);
}
#[test]
fn mismatched_source_reference_declines_before_publication() {
    let root = tempfile::tempdir().unwrap();
    let (_, compressed) = source(b"source content", Compression::none());
    let wrong = "a".repeat(40);
    let mut capture = Capture::default();
    capture
        .virtual_file(object_path(root.path(), &wrong), compressed)
        .unwrap();
    assert!(
        capture
            .sources(root.path(), &[wrong])
            .is_err(),
    );
}
