use super::{Budget, capture, digest};
use rayon::ThreadPoolBuilder;
use serde_json::json;
use std::fs;

#[test]
fn parallel_sources_preserve_order_hashes_and_share_one_allocation_budget() {
    let directory = crate::workspace::engine::command::scratch::Directory::create().unwrap();
    let files = (0..40)
        .map(|index| {
            let path = directory.0.join(index.to_string());
            fs::write(&path, b"\xef\xbb\xbfvalue\r\n").unwrap();
            json!({"relativePath":format!("{index}.js"),"source":{
            "spoolPath":path,"spoolHash":digest(b"\xef\xbb\xbfvalue\r\n")}})
        })
        .collect::<Vec<_>>();
    let version = json!({"files":[{"relativePath":"3.js","test":true}]});
    let serial = ThreadPoolBuilder::new()
        .num_threads(1)
        .build()
        .unwrap();
    let parallel = ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap();
    let expected = serial
        .install(|| capture(&version, &files, &Budget::new(400)))
        .unwrap();
    let actual = parallel
        .install(|| capture(&version, &files, &Budget::new(400)))
        .unwrap();
    assert_eq!(actual, expected);
    assert_eq!(actual[3].0["test"], true);
    assert_eq!(actual[3].0["file"], digest(b"value\n"));
    assert!(
        parallel
            .install(|| capture(&version, &files, &Budget::new(399)))
            .is_err(),
    );
    fs::write(directory.0.join("4"), b"changed").unwrap();
    assert!(
        parallel
            .install(|| capture(&version, &files, &Budget::new(400)))
            .is_err(),
    );
}
