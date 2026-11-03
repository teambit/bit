//! Unit tests for parallel workspace file read batches ([`Directory`], [`response`]) and hash normalization in `bit-object-import`.
//!
//! Verifies that parallel file reads match serial ordering, raw hashes, and normalized snapshot hashes ([`parallel_reads_match_serial_order_bytes_and_three_hashes`], [`parallel_reads_preserve_exact_aggregate_limit_and_return_no_partial_data`]).

use super::{Directory, response};
use serde_json::json;
/// Verifies that parallel file batch reads via [`response`] preserve file order, raw hashes, and normalized hashes.
#[test]
fn parallel_reads_match_serial_order_bytes_and_three_hashes() {
    let directory = Directory::new();
    let inputs: [&[u8]; 6] =
        [b"plain\n", b"\xef\xbb\xbftext\r\n", b"\0\r\n", b"\xff\xfe\r\n", b"", b"\xef\xbb\xbf"];
    let files: Vec<_> = (0..130)
        .map(|index| directory.write(&format!("{index}"), inputs[index % inputs.len()]))
        .collect();
    let serial = rayon::ThreadPoolBuilder::new()
        .num_threads(1)
        .build()
        .unwrap();
    let expected = super::super::read::read(&files, &serial).unwrap();
    let output = response(&json!({"kind":"read", "files":files}));
    assert_eq!(output["failed"], false);
    assert_eq!(output["data"]["files"], serde_json::to_value(expected).unwrap());
    for (index, file) in output["data"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
    {
        assert_eq!(file["path"], json!(files[index]));
        assert_eq!(file["hash"], super::super::hash(inputs[index % inputs.len()]));
    }
    assert_eq!(output["data"]["files"][0]["snapshotHash"], super::super::hash(b"plain\n"));
    assert_eq!(output["data"]["files"][1]["snapshotHash"], super::super::hash(b"text\r\n"));
    assert_eq!(output["data"]["files"][1]["linuxHash"], super::super::hash(b"text\n"));
}
/// Verifies that a single large file within the shared aggregate request budget succeeds via [`response`].
#[test]
fn large_single_file_can_use_the_shared_request_budget() {
    let directory = Directory::new();
    let empty = directory.write("empty", b"");
    let mut files = vec![empty; 32];
    files[0] = directory.write("large", &vec![b'x'; 3 * 1024 * 1024]);
    let output = response(&json!({"kind":"read", "files":files}));
    assert_eq!(output["failed"], false);
    assert_eq!(output["completed"], 32);
    assert_eq!(
        output["data"]["files"][0]["contents"]
            .as_str()
            .unwrap()
            .len(),
        6 * 1024 * 1024,
    );
}
/// Verifies that parallel file batch reads via [`response`] enforce exact aggregate byte limits without returning partial data.
#[test]
fn parallel_reads_preserve_exact_aggregate_limit_and_return_no_partial_data() {
    let directory = Directory::new();
    let empty = directory.write("empty", b"");
    let large = directory.write("large", &vec![b'x'; 2 * 1024 * 1024]);
    let mut files = vec![empty; 32];
    files[..4].fill(large.clone());
    assert_eq!(response(&json!({"kind":"read", "files":files}))["failed"], false);
    files[4] = large;
    let output = response(&json!({"kind":"read", "files":files}));
    assert_eq!(output["failed"], true);
    assert_eq!(output["completed"], 0);
    assert!(output.get("data").is_none());
    files[4] = directory.0.join("missing");
    let output = response(&json!({"kind":"read", "files":files}));
    assert_eq!(output["failed"], true);
    assert!(output.get("data").is_none());
}

/// Verifies that `read_with` keeps mixed-size file batch reads on the Rayon worker pool even when one file exceeds a worker share.
#[test]
fn mixed_file_sizes_keep_successful_reads_on_the_worker_pool() {
    let directory = Directory::new();
    let ordinary = directory.write("ordinary", &[0xff; 4096]);
    let mut files = vec![ordinary; 130];
    files[33] = directory.write("larger", &vec![b'x'; 3 * 1024 * 1024]);
    let output = super::super::read::read_with(&files, &super::POOL, |_, body| {
        (body.len(), rayon::current_thread_index())
    })
    .unwrap();
    assert_eq!(output.len(), 130);
    for (index, (length, worker)) in output.iter().enumerate() {
        assert_eq!(*length, if index == 33 { 3 * 1024 * 1024 } else { 4096 });
        assert!(worker.is_some(), "an oversized batch share must not serialize the whole read");
    }
}

/// Verifies that [`response`] returns `completed: 0` and an empty `files` array ([`json`]) for an empty `read` request.
#[test]
fn empty_file_batch_returns_empty_files_array_with_zero_completed() {
    let output = response(&json!({"kind":"read", "files":[]}));
    assert_eq!(output["failed"], false);
    assert_eq!(output["completed"], 0);
    assert_eq!(output["data"]["files"], json!([]));
}
