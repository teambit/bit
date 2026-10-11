use super::{binary, normalize};
#[test]
fn detects_binary_nuls_pdfs_controls_and_suspicious_byte_density() {
    for bytes in [b"\0".as_slice(), b"%PDF-1.7\n", b"\xff\xff\xff", b"\x01\x02\x03"] {
        assert!(binary(bytes));
    }
    for bytes in [b"".as_slice(), b"ASCII\r\n", b"\t\n", "日本語".as_bytes(), "café".as_bytes()]
    {
        assert!(!binary(bytes));
    }
}
#[test]
fn bom_overrides_and_only_first_512_bytes_match_canonical_classifier() {
    for bom in [
        b"\xef\xbb\xbf".as_slice(),
        b"\xff\xfe",
        b"\xfe\xff",
        b"\0\0\xfe\xff",
        b"\xff\xfe\0\0",
        b"\x84\x31\x95\x33",
    ] {
        assert!(!binary(&[bom, b"\0\xff\n"].concat()));
    }
    let mut bytes = vec![b'a'; 512];
    bytes.push(0);
    assert!(!binary(&bytes));
}
#[test]
fn normalizes_all_newline_styles_on_both_platforms_and_preserves_binary() {
    let bytes = b"a\r\nb\rc\nd".to_vec();
    assert_eq!(normalize(bytes.clone(), false), b"a\nb\nc\nd");
    assert_eq!(normalize(bytes, true), b"a\r\nb\r\nc\r\nd");
    assert_eq!(normalize(b"\0\r\n".to_vec(), false), b"\0\r\n");
}
#[test]
fn retains_invalid_utf8_if_no_newline_changes_and_decodes_when_changes_exist() {
    let mut bytes = vec![b'a'; 100];
    bytes.push(255);
    assert_eq!(normalize(bytes.clone(), false), bytes);
    bytes.extend_from_slice(b"\r\n");
    let mut expected = vec![b'a'; 100];
    expected.extend_from_slice("�\n".as_bytes());
    assert_eq!(normalize(bytes, false), expected);
}
