use super::{capture, wire};
use crate::inspection::{hash, tests::Fixture};
use serde_json::json;
use std::fs;

fn request(fixture: &Fixture, bodies: &[&[u8]]) -> wire::Begin {
    let directory = fixture.directory("snapshots");
    let files: Vec<_> = bodies
        .iter()
        .enumerate()
        .map(|(index, body)| {
            let path = fixture.0.join(format!("file-{index}"));
            fs::write(&path, body).unwrap();
            json!({"relativePath":format!("file-{index}"),"path":path,"rawHash":hash(body)})
        })
        .collect();
    serde_json::from_value(
        json!({"files":files,"workspaceRoot":false,"snapshotDirectory":directory}),
    )
    .unwrap()
}

#[test]
fn parallel_capture_preserves_input_order_hashes_and_binary_normalization() {
    let bodies: [&[u8]; 8] = [
        b"ascii\n",
        b"crlf\r\n",
        b"\xef\xbb\xbfBOM\r\n",
        b"\0\xff\r\n",
        b"",
        "Ω🌱\r\n".as_bytes(),
        b"bare\r",
        b"\xffinvalid\n",
    ];
    let snapshots: [&[u8]; 8] = [
        b"ascii\n",
        b"crlf\r\n",
        b"BOM\r\n",
        b"\0\xff\r\n",
        b"",
        "Ω🌱\r\n".as_bytes(),
        b"bare\r",
        b"\xffinvalid\n",
    ];
    let normalized: [&[u8]; 8] = [
        b"ascii\n",
        b"crlf\n",
        b"BOM\n",
        b"\0\xff\r\n",
        b"",
        "Ω🌱\r\n".as_bytes(),
        b"bare\n",
        b"\xffinvalid\n",
    ];
    for threads in [1, 2, 4] {
        let fixture = Fixture::new();
        let input = request(&fixture, &bodies);
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .build()
            .unwrap();
        let files = pool.install(|| capture(&input, 4096)).unwrap();
        for (index, file) in files.iter().enumerate() {
            assert_eq!(file.relative_path, format!("file-{index}"));
            assert_eq!(file.raw_hash, hash(bodies[index]));
            assert_eq!(file.snapshot_hash, hash(snapshots[index]));
            assert_eq!(file.linux_hash, hash(normalized[index]));
            assert_eq!(file.contents, snapshots[index]);
        }
    }
}

#[test]
fn skewed_batches_retry_within_the_budget_and_reject_an_exhausted_budget() {
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap();
    for maximum in [3007, 3006] {
        let fixture = Fixture::new();
        let large = vec![b'x'; 3000];
        let input = request(&fixture, &[&large, b"a", b"b", b"c", b"d", b"e", b"f", b"g"]);
        let directory = input.snapshot_directory.clone();
        let result = pool.install(|| capture(&input, maximum));
        if maximum == 3007 {
            assert_eq!(
                result
                    .unwrap()
                    .iter()
                    .map(|file| file.contents.len())
                    .sum::<usize>(),
                3007,
            );
        } else {
            assert!(result.is_err());
        }
        assert_eq!(fs::read_dir(directory).unwrap().count(), 0);
    }
}
