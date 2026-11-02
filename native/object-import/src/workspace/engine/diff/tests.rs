//! Unit tests for workspace file [`equivalent`] byte-equivalence and [`frozen`] unchanged diff batching.
//!
//! Ensures EOL/binary byte comparison and parallel unchanged diff filtering avoid unnecessary `git` spawns.

use super::{equivalent, frozen};

#[test]
fn byte_equality_preserves_eol_binary_and_missing_file_semantics() {
    let cases: &[Option<&[u8]>] = &[
        None,
        Some(b""),
        Some(b"x\n"),
        Some(b"x\r\n"),
        Some(b"\0\r\n"),
        Some(b"\xef\xbb\xbfx\n"),
        Some(b"\xffinvalid"),
        Some(b"bare\r"),
    ];
    let canonical = |value: Option<&[u8]>| {
        value.map(|body| super::hash(&crate::checkout::eol::normalize(body.to_vec(), false)))
    };
    for left in cases {
        for right in cases {
            assert_eq!(equivalent(*left, *right), canonical(*left) == canonical(*right));
        }
    }
}

#[test]
fn unchanged_batches_preserve_order_on_the_configured_workers_without_running_git() {
    for threads in [1, 2, 8] {
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .build()
            .unwrap();
        let files = (0..65)
            .map(|index| {
                let body = format!("original-{index}\n").into_bytes();
                (format!("file-{index}"), Some(body.clone()), Some(body))
            })
            .collect();
        let output = pool.install(|| frozen(files, "missing-git-must-not-run", false)).unwrap();
        for (index, file) in output.iter().enumerate() {
            assert_eq!(file.relative_path, format!("file-{index}"));
            assert_eq!(file.from_content, format!("original-{index}\n"));
            assert_eq!(file.from_content, file.to_content);
            assert!(file.raw_diff.is_empty());
            assert!(file.same);
        }
        assert_eq!(output.len(), 65);
    }
}

#[test]
fn empty_frozen_diff_batch_returns_empty_vec_immediately() {
    let output = frozen(Vec::new(), "missing-git-must-not-run", false).unwrap();
    assert!(output.is_empty());
}
