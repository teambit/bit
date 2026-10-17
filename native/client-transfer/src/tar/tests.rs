use super::{read, read_bounded};
use std::io::{self, Read};
fn archive(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut archive = tar::Builder::new(Vec::new());
    for (name, bytes) in entries {
        let mut header = tar::Header::new_gnu();
        header.set_size(bytes.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        archive.append_data(&mut header, name, *bytes).unwrap();
    }
    archive.into_inner().unwrap()
}
#[test]
fn current_schema_requires_a_truthy_end_but_old_streams_do_not() {
    let start = br#"{"schema":"1.0.0","scopeName":"remote.scope"}"#;
    let missing = archive(&[(".BIT.START", start)]);
    assert_eq!(
        read(&missing).unwrap_err().to_string(),
        r#"server terminated the stream unexpectedly (metadata: {"schema":"1.0.0","scopeName":"remote.scope"})"#,
    );
    assert!(read(&archive(&[(".BIT.START", br#"{"schema":"0.0.1"}"#)])).is_ok());
    assert!(read(&archive(&[(".BIT.START", start), (".BIT.END", b"null")])).is_err());
    assert!(read(&archive(&[(".BIT.START", start), (".BIT.END", b"{}")])).is_ok());
}
#[test]
fn malformed_metadata_and_remote_error_never_return_partial_objects() {
    for name in [".BIT.START", ".BIT.END"] {
        assert!(read(&archive(&[(name, b"{")])).is_err());
    }
    let hash = "a".repeat(40);
    let bytes = archive(&[(&hash, b"compressed"), (".BIT.ERROR", b"server failed")]);
    assert_eq!(read(&bytes).unwrap_err().to_string(), "server failed");
    assert!(read_bounded(&bytes, bytes.len() - 1).is_err());
}
#[test]
fn entry_headers_and_bodies_can_cross_every_reader_boundary() {
    struct Pieces(io::Cursor<Vec<u8>>);
    impl Read for Pieces {
        fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
            let size = output.len().min(7);
            self.0.read(&mut output[..size])
        }
    }
    let hash = "b".repeat(40);
    let bytes = archive(&[(&hash, b"compressed")]);
    let items = super::read_from(Pieces(io::Cursor::new(bytes)), 4096).unwrap();
    assert_eq!(items[0].hash, hash);
    assert_eq!(items[0].compressed, b"compressed");
}
