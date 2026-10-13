use super::{MAX_BYTES, wire};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-current-read-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn files(&self, count: usize) -> Vec<wire::Current> {
        (0..count)
            .map(|index| self.file(index, format!("\u{feff}file {index}\r\n").as_bytes()))
            .collect()
    }
    fn file(&self, index: usize, bytes: &[u8]) -> wire::Current {
        let name = format!("file-{index}");
        let path = self.0.join(&name);
        fs::write(&path, bytes).unwrap();
        wire::Current {
            read_token: None,
            relative_path: name,
            path,
            raw_hash: super::super::digest(bytes),
            snapshot_hash: super::super::digest(
                bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes),
            ),
            protected: false,
            source_hash: None,
            bitmap: false,
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn load(files: &[wire::Current], total: &mut usize) -> std::io::Result<Vec<super::Loaded>> {
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap();
    let mut compressed = 17;
    let result =
        pool.install(|| super::super::load(files, &files[0].path, total, &mut compressed, None));
    assert_eq!(compressed, 17);
    result
}

#[test]
fn ordered_parallel_reads_match_serial_bom_and_line_ending_semantics() {
    let fixture = Fixture::new();
    let mut files = fixture.files(65);
    files[3] = fixture.file(3, b"binary\0\xff\r\n");
    let mut serial_total = 13;
    let expected = super::super::load(&files, &fixture.0, &mut serial_total, &mut 0, None).unwrap();
    let mut parallel_total = 13;
    let actual = load(&files, &mut parallel_total).unwrap();
    assert_eq!(parallel_total, serial_total);
    assert_eq!(actual.len(), expected.len());
    for (actual, expected) in actual.iter().zip(expected) {
        assert_eq!(actual.raw, expected.raw);
        assert_eq!(actual.normalized, expected.normalized);
    }
}

#[test]
fn skewed_reads_retry_without_exceeding_the_aggregate_budget() {
    let fixture = Fixture::new();
    let mut files = fixture.files(65);
    files[0] = fixture.file(0, &vec![b'x'; 1024 * 1024]);
    let bytes: usize = files
        .iter()
        .map(|file| fs::metadata(&file.path).unwrap().len() as usize)
        .sum();
    let mut total = MAX_BYTES - bytes;
    assert_eq!(load(&files, &mut total).unwrap().len(), files.len());
    assert_eq!(total, MAX_BYTES);
    assert!(load(&files, &mut (MAX_BYTES - bytes + 1)).is_err());
}

#[test]
fn changed_or_missing_late_files_decline_the_entire_preparation() {
    let fixture = Fixture::new();
    let mut files = fixture.files(65);
    fs::write(&files[64].path, b"changed").unwrap();
    assert!(load(&files, &mut 0).is_err());
    files[64] = fixture.file(64, b"restored");
    fs::remove_file(&files[64].path).unwrap();
    assert!(load(&files, &mut 0).is_err());
}

#[test]
fn repeated_labels_decline_before_any_parallel_reads() {
    let fixture = Fixture::new();
    let mut files = fixture.files(65);
    files[64].relative_path = files[0].relative_path.clone();
    let mut total = 7;
    assert!(load(&files, &mut total).is_err());
    assert_eq!(total, 7);
}
