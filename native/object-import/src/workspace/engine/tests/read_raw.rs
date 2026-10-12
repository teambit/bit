use super::{Directory, POOL, frame, serve};
use serde_json::{Value, json};
use std::io::Cursor;

fn raw(value: &Value) -> (Value, Vec<u8>) {
    let mut output = Vec::new();
    serve(&mut Cursor::new(frame(value)), &mut output, &POOL).unwrap();
    let newline = output
        .iter()
        .position(|byte| *byte == b'\n')
        .unwrap();
    (serde_json::from_slice(&output[..newline]).unwrap(), output[newline + 1..].to_vec())
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
