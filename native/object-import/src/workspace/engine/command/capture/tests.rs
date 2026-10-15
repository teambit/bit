use super::{all, read, snapshots};
use serde_json::json;
use std::{fs, path::PathBuf};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .join(format!("bit-command-private-capture-{}", std::process::id()));
        fs::create_dir_all(root.join("component")).unwrap();
        Self(root)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn private_capture_retains_large_parallel_sources_without_expanding_the_wire_budget() {
    let fixture = Fixture::new();
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap();
    let body = vec![b'x'; 512 * 1024];
    let names = (0..64)
        .map(|index| format!("source-{index}.js"))
        .collect::<Vec<_>>();
    let paths = names
        .iter()
        .map(|name| fixture.0.join("component").join(name))
        .collect::<Vec<_>>();
    for path in &paths {
        fs::write(path, &body).unwrap();
    }
    let mut state = snapshots::State::default();
    let older_path = fixture.0.join("older");
    let older = state
        .retain(snapshots::Observation {
            path: older_path.clone(),
            raw_hash: "old".into(),
            snapshot_hash: "old".into(),
            raw_bytes: 1,
            contents: vec![0].into(),
        })
        .unwrap();
    let input = json!({"identity":"scope/component","version":"1.0.0","directory":"component",
        "files":names,"current":{"mainFile":"source-0.js"}});
    let captured = all(&fixture.0, vec![input], &mut state, &pool).unwrap();
    assert!(state.get(older, &older_path, "old").is_none());
    let files = captured[0].files.as_array().unwrap();
    assert_eq!(files.len(), 64);
    for (index, file) in files.iter().enumerate() {
        let retained = state
            .get(
                file["readToken"].as_u64().unwrap(),
                &paths[index],
                file["rawHash"].as_str().unwrap(),
            )
            .unwrap();
        assert_eq!(retained.contents.as_ref(), body);
        assert!(file.get("contents").is_none());
    }
    assert!(serde_json::to_vec(&captured[0].files).unwrap().len() < 64 * 1024);
    assert!(read::read_with(&paths, &pool, |_, bytes| bytes.len()).is_err());
    let output = read::read_with_budget(&paths, &pool, snapshots::MAX_BYTES, |_, bytes| {
        assert!(rayon::current_thread_index().is_some());
        bytes.len()
    })
    .unwrap();
    assert_eq!(output.iter().sum::<usize>(), snapshots::MAX_BYTES);
    fs::write(&paths[0], vec![b'x'; body.len() + 1]).unwrap();
    assert!(
        read::read_with_budget(&paths, &pool, snapshots::MAX_BYTES, |_, bytes| bytes.len())
            .is_err(),
    );
}
