use super::{Directory, POOL, frame, serve};
use serde_json::{Value, json};
use std::io::Cursor;

fn raw(value: &Value) -> (Value, Vec<u8>) {
    raw_with(value, &mut crate::workspace::snapshots::State::default())
}
fn raw_with(value: &Value, snapshots: &mut crate::workspace::snapshots::State) -> (Value, Vec<u8>) {
    let mut output = Vec::new();
    serve(&mut Cursor::new(frame(value)), &mut output, &POOL, snapshots).unwrap();
    let newline = output
        .iter()
        .position(|byte| *byte == b'\n')
        .unwrap();
    (serde_json::from_slice(&output[..newline]).unwrap(), output[newline + 1..].to_vec())
}

#[test]
fn explicitly_retained_reads_keep_the_original_observation_after_disk_deletion() {
    let directory = Directory::new();
    let file = directory.write("original", b"\xef\xbb\xbforiginal\r\n");
    let mut snapshots = crate::workspace::snapshots::State::default();
    let (header, body) = raw_with(
        &json!({"kind":"read","files":[file,file],"binary":true,"retain":true}),
        &mut snapshots,
    );
    assert_eq!(header["completed"], 2);
    assert_eq!(body, b"original\r\noriginal\r\n");
    std::fs::remove_file(&file).unwrap();
    let records = header["data"]["files"].as_array().unwrap();
    assert_ne!(records[0]["readToken"], records[1]["readToken"]);
    for record in records {
        let token = record["readToken"].as_u64().unwrap();
        let saved = snapshots
            .get(token, &file, record["hash"].as_str().unwrap())
            .unwrap();
        assert_eq!(saved.contents.as_ref(), b"original\r\n");
        assert_eq!(saved.raw_bytes, 13);
    }
    let (missing, body) = raw_with(
        &json!({"kind":"read","files":[file],"binary":true,"retain":true}),
        &mut snapshots,
    );
    assert_eq!(missing["failed"], true);
    assert!(body.is_empty());
}
#[test]
fn binary_reads_preserve_order_bom_hashes_and_non_utf8_bytes() {
    let directory = Directory::new();
    let bodies: [&[u8]; 4] = [b"\xef\xbb\xbfline\r\n", b"\0\xff\n", b"", b"plain"];
    let files: Vec<_> = (0..64)
        .map(|index| directory.write(&format!("{index}.txt"), bodies[index % 4]))
        .collect();
    let legacy = super::response(&json!({"kind":"read", "files":files}));
    let (header, bytes) = raw(&json!({"kind":"read", "files":files, "binary":true}));
    assert_eq!(header["completed"], 64);
    assert_eq!(header["binaryBytes"], bytes.len());
    let mut offset = 0;
    for (index, file) in header["data"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
    {
        let size = file["bytes"].as_u64().unwrap() as usize;
        assert_eq!(file["offset"], offset);
        assert_eq!(
            crate::validate::hexadecimal(&bytes[offset..offset + size]),
            legacy["data"]["files"][index]["contents"],
        );
        for key in ["path", "hash", "linuxHash", "snapshotHash"] {
            assert_eq!(file[key], legacy["data"]["files"][index][key]);
        }
        assert!(file.get("readToken").is_none());
        offset += size;
    }
    assert_eq!(offset, bytes.len());
}
#[test]
fn binary_read_failures_emit_no_payload_or_completed_prefix() {
    let directory = Directory::new();
    let valid = directory.write("valid", b"valid");
    let oversized = directory.write("large", &vec![1; super::super::MAX_RAW + 1]);
    for last in [oversized, directory.0.join("missing")] {
        let (header, bytes) = raw(&json!({"kind":"read", "files":[valid,last], "binary":true}));
        assert_eq!(header["failed"], true);
        assert_eq!(header["completed"], 0);
        assert!(bytes.is_empty());
    }
}
