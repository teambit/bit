use flate2::{Compression, write::ZlibEncoder};
use std::io::Write;
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
