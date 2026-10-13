use super::load;
use crate::inspection::{hash, tests::Fixture, wire};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::json;
use std::io::Write;

fn store(store: &crate::store::Store, body: &[u8], index: usize) -> wire::Model {
    let identity = hash(body);
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    let length = String::from_utf8_lossy(body).encode_utf16().count();
    encoder
        .write_all(format!("Source {identity} {length}\0").as_bytes())
        .unwrap();
    encoder.write_all(body).unwrap();
    store
        .write(&identity, &encoder.finish().unwrap())
        .unwrap();
    serde_json::from_value(json!({"relativePath":format!("file-{index}"),"hash":identity})).unwrap()
}

#[test]
fn parallel_model_reads_preserve_order_and_retry_skewed_budgets() {
    let fixture = Fixture::new();
    let directory = fixture.directory("objects");
    let repository = crate::store::Store::new(directory.clone(), None).unwrap();
    let mut bodies = vec![vec![b'x'; 100_000]];
    bodies.extend((0..7).map(|index| vec![index]));
    let models: Vec<_> = bodies
        .iter()
        .enumerate()
        .map(|(index, body)| store(&repository, body, index))
        .collect();
    for threads in [1, 2, 4] {
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(threads)
            .build()
            .unwrap();
        assert_eq!(pool.install(|| load(&directory, &models, 100_007)).unwrap(), bodies);
        assert!(pool.install(|| load(&directory, &models, 100_006)).is_err());
    }
}

#[test]
fn invalid_stored_sources_do_not_return_a_partial_parallel_result() {
    let fixture = Fixture::new();
    let directory = fixture.directory("objects");
    let repository = crate::store::Store::new(directory.clone(), None).unwrap();
    let mut models: Vec<_> = (0..8)
        .map(|index| store(&repository, &[index], index as usize))
        .collect();
    models[4].hash = hash(b"absent");
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .unwrap();
    assert!(pool.install(|| load(&directory, &models, 4096)).is_err());
}
