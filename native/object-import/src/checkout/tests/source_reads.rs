use super::{Directory, frame, pool, store};
use crate::checkout::{cache, read_sources};
use serde_json::Value;
use std::{fs, io::Cursor};

fn response(bytes: Vec<u8>, state: &mut cache::State) -> (Value, Vec<u8>) {
    let mut output = Vec::new();
    read_sources(&mut Cursor::new(bytes), &mut output, state, pool()).unwrap();
    let end = output
        .iter()
        .position(|byte| *byte == b'\n')
        .unwrap();
    (serde_json::from_slice(&output[..end]).unwrap(), output[end + 1..].to_vec())
}
#[test]
fn parallel_raw_source_reads_preserve_original_bytes_and_distinct_occurrences() {
    let directory = Directory::new();
    let target = directory.0.join("must-not-write");
    let body = b"\xef\xbb\xbf\xff\0\r\noriginal";
    let hash = store(&directory.0, body);
    let inputs = vec![(hash, target.as_path(), 1, 0); 65];
    let (header, bytes) = response(frame(&directory.0, &inputs), &mut cache::State::default());
    assert_eq!(header["completed"], 65);
    assert_eq!(bytes, body.repeat(65));
    for (index, row) in header["data"]
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
    {
        assert_eq!(row[0], index * body.len());
        assert_eq!(row[1], body.len());
        assert!(row[2].as_u64().unwrap() > 0);
        assert!(row[3].as_u64().unwrap() > body.len() as u64);
    }
    assert!(!target.exists());
}
#[test]
fn cached_read_authority_is_explicit_and_never_hides_an_uncached_missing_file() {
    let directory = Directory::new();
    let target = directory.0.join("must-not-write");
    let hash = store(&directory.0, b"body");
    let mut state = cache::State::default();
    assert_eq!(response(frame(&directory.0, &[(hash, &target, 1, 0)]), &mut state).1, b"body");
    let name = crate::validate::hexadecimal(&hash);
    fs::remove_file(
        directory.0
            .join(&name[..2])
            .join(&name[2..]),
    )
    .unwrap();
    let (cached, body) = response(frame(&directory.0, &[(hash, &target, 3, 0)]), &mut state);
    assert_eq!(cached["completed"], 1);
    assert!(cached["data"][0].is_null());
    assert!(body.is_empty());
    let (missing, body) = response(frame(&directory.0, &[(hash, &target, 1, 0)]), &mut state);
    assert_eq!(missing["completed"], 0);
    assert_eq!(missing["failed"], true);
    assert!(body.is_empty());
}
#[test]
fn source_reads_reject_normalization_and_excessive_counts_before_any_acknowledged_body() {
    let directory = Directory::new();
    let target = directory.0.join("must-not-write");
    let hash = store(&directory.0, b"body\r\n");
    let mut state = cache::State::default();
    let (header, body) = response(frame(&directory.0, &[(hash, &target, 1, 1)]), &mut state);
    assert_eq!(header["failed"], true);
    assert!(body.is_empty());
    let mut output = Vec::new();
    let inputs = vec![(hash, target.as_path(), 1, 0); 257];
    assert!(
        read_sources(
            &mut Cursor::new(frame(&directory.0, &inputs)),
            &mut output,
            &mut state,
            pool()
        )
        .is_err(),
    );
    assert!(output.is_empty());
    assert!(!target.exists());
}
#[test]
fn skewed_source_sizes_share_the_request_budget_and_whole_batch_limits_still_apply() {
    let directory = Directory::new();
    let target = directory.0.join("must-not-write");
    let body = vec![b'x'; 1024 * 1024];
    let hash = store(&directory.0, &body);
    let small = store(&directory.0, b"small");
    let mut inputs = vec![(small, target.as_path(), 1, 0); 63];
    inputs.push((hash, &target, 1, 0));
    let (header, bytes) = response(frame(&directory.0, &inputs), &mut cache::State::default());
    assert_eq!(header["completed"], 64);
    assert_eq!(&bytes[63 * 5..], body);
    let inputs = vec![(hash, target.as_path(), 1, 0); 32];
    let (header, bytes) = response(frame(&directory.0, &inputs), &mut cache::State::default());
    assert_eq!(header["failed"], false);
    assert_eq!(header["completed"], 32);
    assert_eq!(bytes.len(), 32 * body.len());
    let inputs = vec![(hash, target.as_path(), 1, 0); 33];
    let (header, bytes) = response(frame(&directory.0, &inputs), &mut cache::State::default());
    assert_eq!(header["failed"], true);
    assert_eq!(header["completed"], 0);
    assert!(bytes.is_empty());
}
