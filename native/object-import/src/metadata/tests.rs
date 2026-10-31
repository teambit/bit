use super::{MAX_BYTES, inflate};
use flate2::{Compression, write::ZlibEncoder};
use std::io::Write;

fn compressed(bytes: &[u8]) -> Vec<u8> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(bytes).unwrap();
    encoder.finish().unwrap()
}

#[test]
fn metadata_is_lossless_and_bounded_without_parsing_json() {
    let contents = "Version external-hash 0\0{\"unicode\":\"日本語 🚀\",\"invalid\":";
    assert_eq!(inflate(&compressed(contents.as_bytes())).as_deref(), Some(contents));
    assert!(inflate(&compressed(&[255])).is_none());
    assert_eq!(inflate(&compressed(&vec![b'a'; MAX_BYTES])).unwrap().len(), MAX_BYTES);
    assert!(inflate(&compressed(&vec![b'a'; MAX_BYTES + 1])).is_none());
}

#[test]
fn corrupt_truncated_and_trailing_streams_never_return_metadata() {
    let bytes = compressed(b"Version hash 2\0{}");
    for size in 0..bytes.len() {
        assert!(inflate(&bytes[..size]).is_none());
    }
    let mut corrupt = bytes.clone();
    let last = corrupt.len() - 1;
    corrupt[last] ^= 1;
    assert!(inflate(&corrupt).is_none());
    let mut trailing = bytes;
    trailing.push(0);
    assert!(inflate(&trailing).is_none());
}
