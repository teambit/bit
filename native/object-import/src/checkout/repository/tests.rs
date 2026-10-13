use flate2::{Compression, write::ZlibEncoder};
use std::io::Write;

fn compress(body: &[u8]) -> Vec<u8> {
    let mut compressor = ZlibEncoder::new(Vec::new(), Compression::default());
    compressor.write_all(body).unwrap();
    compressor.finish().unwrap()
}

#[test]
fn shared_inflation_charges_exact_body_bytes_across_chunks_and_records() {
    let body = vec![b'x'; 128 * 1024 + 1];
    let mut object = format!("Source {} {}\0", "a".repeat(40), body.len()).into_bytes();
    object.extend_from_slice(&body);
    let compressed = compress(&object);
    let budget = crate::read_budget::Budget::new(body.len() * 2);
    for _ in 0..2 {
        let inflated = super::inflate_with(&compressed, object.len(), Some(&budget)).unwrap();
        assert_eq!(inflated, object);
    }
    assert!(super::inflate_with(&compressed, object.len(), Some(&budget)).is_err());
    let empty = format!("Source {} 0\0", "b".repeat(40));
    assert_eq!(
        super::inflate_with(&compress(empty.as_bytes()), 256, Some(&budget)).unwrap(),
        empty.as_bytes(),
    );
}

#[test]
fn shared_inflation_rejects_unbounded_headers_and_trailing_compressed_data() {
    let invalid = [vec![b'x'; 256], vec![0]].concat();
    let oversized =
        super::inflate_with(&compress(&invalid), 512, Some(&crate::read_budget::Budget::new(512)));
    assert!(oversized.is_err());
    let valid = format!("Source {} 0\0", "a".repeat(40));
    let trailing = [compress(valid.as_bytes()), vec![0]].concat();
    let result = super::inflate_with(&trailing, 256, Some(&crate::read_budget::Budget::new(0)));
    assert!(result.is_err());
}

#[test]
fn reusable_inflater_resets_after_success_limits_and_malformed_streams() {
    let body = vec![b'x'; 128 * 1024 + 1];
    let mut compressor = ZlibEncoder::new(Vec::new(), Compression::default());
    compressor.write_all(&body).unwrap();
    let bytes = compressor.finish().unwrap();
    for _ in 0..4 {
        assert_eq!(super::inflate(&bytes, body.len()).unwrap(), body);
        assert!(super::inflate(&bytes, body.len() - 1).is_err());
        assert!(super::inflate(&bytes[..bytes.len() - 1], body.len()).is_err());
        assert!(super::inflate(&[bytes.as_slice(), b"extra"].concat(), body.len()).is_err());
        assert!(super::inflate(b"corrupt", body.len()).is_err());
        assert_eq!(super::inflate(&bytes, body.len()).unwrap(), body);
    }
}
