use super::{Repository, from_model, json, snapshots};
use flate2::{Compression, write::ZlibEncoder};
use std::{fs, io::Write, path::PathBuf};

struct Fixture(PathBuf);
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
#[test]
fn hidden_sources_are_parallel_retained_and_proven_without_workspace_files() {
    let fixture = Fixture(
        std::env::temp_dir().join(format!("bit-hidden-lane-capture-{}", std::process::id())),
    );
    let objects = fixture.0.join(".bit/objects");
    fs::create_dir_all(&objects).unwrap();
    let mut rows = Vec::new();
    let mut paths = Vec::new();
    for index in 0..40 {
        let body = format!("module.exports = {index};\n");
        let hash = crate::workspace::engine::hash(body.as_bytes());
        let path = objects
            .join(&hash[..2])
            .join(&hash[2..]);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder
            .write_all(format!("Source {hash} {}\0{body}", body.len()).as_bytes())
            .unwrap();
        fs::write(&path, encoder.finish().unwrap()).unwrap();
        rows.push(json!({"relativePath":format!("file-{index}.js"),"name":format!("file-{index}.js"),"test":false,"file":hash}));
        paths.push(path);
    }
    let version = json!({"schema":"2.0.0","mainFile":"file-0.js","files":rows});
    let mut repository = Repository::new(&fixture.0, None);
    let mut snapshots = snapshots::State::default();
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap();
    let capture = pool
        .install(|| {
            from_model(
                &fixture.0.join("private"),
                "scope/hidden",
                &"a".repeat(40),
                &version,
                &mut repository,
                &mut snapshots,
            )
        })
        .unwrap();
    assert!(capture.hidden);
    assert!(capture.target.directory.is_empty());
    for row in capture.files.as_array().unwrap() {
        let path = PathBuf::from(row["path"].as_str().unwrap());
        assert!(!path.exists());
        assert!(
            snapshots
                .get(row["readToken"].as_u64().unwrap(), &path, row["rawHash"].as_str().unwrap())
                .is_some(),
        );
    }
    repository.validate().unwrap();
    fs::write(&paths[0], b"changed after capture").unwrap();
    assert!(repository.validate().is_err());
}
