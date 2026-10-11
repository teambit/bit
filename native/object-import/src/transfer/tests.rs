use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

use flate2::{Compression, write::ZlibEncoder};
use sha1::{Digest, Sha1};

use super::{Body, Descriptor, prepare};

static NEXT: AtomicU64 = AtomicU64::new(0);

pub(super) fn directory() -> PathBuf {
    let path = std::env::temp_dir()
        .join(format!(
            "bit-transfer-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
    fs::create_dir_all(&path).unwrap();
    path
}

pub(super) fn source(directory: &std::path::Path, bytes: &[u8]) -> ([u8; 20], Vec<u8>) {
    let hash: [u8; 20] = Sha1::digest(bytes).into();
    let text = crate::validate::hexadecimal(&hash);
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "Source {text} {}\0", bytes.len()).unwrap();
    encoder.write_all(bytes).unwrap();
    let compressed = encoder.finish().unwrap();
    fs::create_dir_all(directory.join(&text[..2])).unwrap();
    fs::write(
        directory
            .join(&text[..2])
            .join(&text[2..]),
        &compressed,
    )
    .unwrap();
    (hash, compressed)
}

fn descriptor(hash: [u8; 20], scope: Option<&str>) -> Descriptor {
    Descriptor {
        hash,
        scope: scope.map(str::to_owned),
        seconds: 1700000000,
        body: Body::Repository,
    }
}

#[test]
fn dedup_preserves_scope_and_first_order_with_frozen_archive() {
    let root = directory();
    let (hash, compressed) = source(&root, b"hello\xff\r\n");
    let archive = root.join("transfer.tar");
    let result = prepare(
        &root,
        &archive,
        vec![descriptor(hash, None), descriptor(hash, None), descriptor(hash, Some("scope.name"))],
    )
    .unwrap();
    let bytes = fs::read(&archive).unwrap();
    assert_eq!(result.count, 2);
    assert_eq!(result.compressed_bytes, compressed.len() * 2);
    assert_eq!(result.archive_bytes, bytes.len());
    assert_eq!(
        result.objects_hash,
        crate::validate::hexadecimal(&Sha1::digest(
            [compressed.as_slice(), compressed.as_slice()].concat()
        )),
    );
    assert_eq!(&bytes[512..512 + compressed.len()], compressed);
    source(&root, b"new unrelated body");
    assert_eq!(fs::read(&result.path).unwrap(), bytes);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn full_preflight_leaves_archive_absent_when_later_source_corrupt() {
    let root = directory();
    let (hash, _) = source(&root, b"valid");
    let archive = root.join("transfer.tar");
    assert!(
        prepare(&root, &archive, vec![descriptor(hash, None), descriptor([9; 20], None)]).is_err(),
    );
    assert!(!archive.exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn existing_archive_and_inline_sources_are_untouched() {
    let root = directory();
    let (hash, compressed) = source(&root, b"valid");
    let archive = root.join("transfer.tar");
    fs::write(&archive, b"owned by caller").unwrap();
    assert!(prepare(&root, &archive, vec![descriptor(hash, None)]).is_err());
    assert_eq!(fs::read(&archive).unwrap(), b"owned by caller");
    fs::remove_file(&archive).unwrap();
    let mut item = descriptor(hash, None);
    item.body = Body::Metadata(compressed);
    assert!(prepare(&root, &archive, vec![item]).is_err());
    assert!(!archive.exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn tar_defaults_and_long_prefix_are_exact() {
    let header = super::header::encode(
        "scope.name/0123456789012345678901234567890123456789",
        123,
        1700000000,
    )
    .unwrap();
    assert_eq!(&header[100..108], b"000644 \0");
    assert_eq!(&header[124..136], b"00000000173 ");
    assert_eq!(&header[257..265], b"ustar\x0000");
    let name = format!("{}/{}", "a".repeat(120), "b".repeat(40));
    let long = super::header::encode(&name, 0, 0).unwrap();
    assert_eq!(&long[..40], "b".repeat(40).as_bytes());
    assert_eq!(&long[345..465], "a".repeat(120).as_bytes());
    assert!(super::header::encode(&"a".repeat(101), 0, 0).is_err());
}

#[test]
fn canonical_tar_stream_header_differential_when_available() {
    let Ok(module) = std::env::var("BIT_TEST_TAR_HEADERS") else { return };
    for name in ["scope.name/hash".to_owned(), format!("{}/{}", "a".repeat(120), "b".repeat(40))] {
        let script = "const h=require(process.argv[1]);const n=process.argv[2];process.stdout.write(h.encode({name:n,mode:420,uid:0,gid:0,size:123,mtime:new Date(1700000000000),type:'file'}));";
        let output = std::process::Command::new("node")
            .args(["-e", script, &module, &name])
            .output()
            .unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, super::header::encode(&name, 123, 1700000000).unwrap());
    }
}
