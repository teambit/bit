use super::{Fixture, State};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::fs;
fn target(fixture: &Fixture, sizes: &[usize]) -> Value {
    let files = sizes.iter().enumerate().map(|(index, size)| {
        let mut bytes = vec![b'x'; *size];
        bytes[..4].copy_from_slice(&(index as u32).to_be_bytes());
        let hash = crate::validate::hexadecimal(&Sha1::digest(&bytes));
        fixture.object(&hash, "Source", &bytes);
        json!({"hash":hash,"relativePath":format!("{index}.bin"),"name":format!("{index}.bin"),"test":false})
    }).collect::<Vec<_>>();
    let manifest = files.iter().map(|file| json!({"file":file["hash"],"relativePath":file["relativePath"],"name":file["name"],"test":file["test"]})).collect::<Vec<_>>();
    fixture.object(
        &"1".repeat(40),
        "Version",
        &serde_json::to_vec(&json!({"files":manifest})).unwrap(),
    );
    json!({"hash":"1".repeat(40), "files":files})
}
#[test]
fn parallel_sources_keep_order_complete_receipts_and_serial_equivalence() {
    let mut serial = None;
    for threads in [1, 4] {
        let fixture = Fixture::new();
        let target = target(&fixture, &[4096; 64]);
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .build()
            .unwrap();
        let prepared =
            pool.install(|| fixture.prepare_packed(&mut State::default(), &target, true));
        assert_eq!(prepared["reads"], json!({"sourceReads":64,"sourceBodyBytes":64 * 4096}));
        let hashes = prepared["bodies"]
            .as_array()
            .unwrap()
            .iter()
            .map(|body| body["spoolHash"].clone())
            .collect::<Vec<_>>();
        assert_eq!(
            hashes,
            target["files"]
                .as_array()
                .unwrap()
                .iter()
                .map(|file| file["hash"].clone())
                .collect::<Vec<_>>(),
        );
        assert_eq!(
            prepared["sources"]
                .as_array()
                .unwrap()
                .len(),
            64,
        );
        let result = json!({"rows":prepared["mergeRows"],"groups":prepared["sourceGroups"],"statuses":prepared["statuses"],"hashes":hashes});
        if let Some(expected) = &serial {
            assert_eq!(&result, expected);
        } else {
            serial = Some(result);
        }
    }
}
#[test]
fn oversized_worker_share_retries_without_duplicate_receipts() {
    let fixture = Fixture::new();
    let mut sizes = [4096; 32];
    sizes[0] = 9 * 1024 * 1024;
    let target = target(&fixture, &sizes);
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap();
    let prepared = pool.install(|| fixture.prepare_packed(&mut State::default(), &target, true));
    assert_eq!(prepared["reads"]["sourceReads"], 32);
    assert_eq!(prepared["reads"]["sourceBodyBytes"], sizes.iter().sum::<usize>());
    assert_eq!(
        prepared["sources"]
            .as_array()
            .unwrap()
            .len(),
        32,
    );
}
#[test]
fn failed_parallel_source_reads_leave_no_private_snapshots() {
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap();
    for oversized in [false, true] {
        let fixture = Fixture::new();
        let target = target(&fixture, &[if oversized { 1024 * 1024 + 1 } else { 4096 }; 32]);
        if !oversized {
            let hash = target["files"][17]["hash"].as_str().unwrap();
            fs::write(
                fixture.0
                    .join("objects")
                    .join(&hash[..2])
                    .join(&hash[2..]),
                b"corrupt",
            )
            .unwrap();
        }
        let request = json!({"objectsDirectory":fixture.0.join("objects"),"snapshotDirectory":fixture.0.join("snapshots"),"target":target,"current":[]});
        assert!(
            pool.install(|| crate::checkout_transition::apply(
                "checkoutPrepare",
                request,
                &mut crate::checkout_transition::State::default()
            ))
            .is_err(),
        );
        assert_eq!(fs::read_dir(fixture.0.join("snapshots")).unwrap().count(), 0);
    }
}

#[test]
fn retarget_reuses_verified_bodies_and_still_checks_the_version_manifest() {
    let fixture = Fixture::new();
    let target = target(&fixture, &[4096; 32]);
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap();
    let mut state = State::default();
    let prepared = pool.install(|| fixture.prepare_packed(&mut state, &target, true));
    for file in target["files"].as_array().unwrap() {
        let hash = file["hash"].as_str().unwrap();
        fs::remove_file(
            fixture.0
                .join("objects")
                .join(&hash[..2])
                .join(&hash[2..]),
        )
        .unwrap();
    }
    let request = json!({"token":prepared["ownerToken"],"planToken":prepared["token"],"target":target,"strategy":"theirs"});
    let applied = pool.install(|| super::apply("mergeApply", request.clone(), &mut state)).unwrap();
    assert_eq!(applied["reads"], json!({"sourceReads":0,"sourceBodyBytes":0}));
    assert_eq!(applied["bodies"], prepared["bodies"]);
    fixture.object(&"1".repeat(40), "Version", b"{\"files\":[]}");
    assert!(pool.install(|| super::apply("mergeApply", request, &mut state)).is_err());
}
