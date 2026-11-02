//! Unit tests for cached source object reuse ([`State`], [`serve`], [`cached_response`]) during checkout preflight in
//! `bit-object-import` repository operations.

use super::{Directory, frame, pool, store, store_raw};
use crate::checkout::{cache::State, serve};
use serde_json::Value;
use std::{io::Cursor, path::Path};
/// Runs [`serve`] in preflight mode against `state` and returns the parsed JSON response.
fn cached_response(
    directory: &Path,
    inputs: &[([u8; 20], &Path, u32, u32)],
    state: &mut State,
) -> Value {
    let mut output = Vec::new();
    serve(&mut Cursor::new(frame(directory, inputs)), &mut output, true, state, pool()).unwrap();
    serde_json::from_slice(&output).unwrap()
}
/// Verifies that preflight reuses cached source bytes only when the caller passes explicit cache authority (`3`).
#[test]
fn preflight_reuses_verified_bytes_only_with_explicit_cache_authority() {
    let directory = Directory::new();
    let hash = store(&directory.0, b"canonical cached body");
    let target = directory.0.join("target");
    let mut state = State::default();
    assert_eq!(cached_response(&directory.0, &[(hash, &target, 3, 0)], &mut state)["completed"], 1);
    store_raw(&directory.0, hash, b"now corrupt");
    assert_eq!(cached_response(&directory.0, &[(hash, &target, 1, 0)], &mut state)["failed"], true);
    assert_eq!(cached_response(&directory.0, &[(hash, &target, 3, 0)], &mut state)["completed"], 1);
    assert!(!target.exists());
}
/// Verifies that parallel preflight checks validate uncached inputs even when mixed with cached authority entries.
#[test]
fn mixed_parallel_preflight_does_not_share_authority_with_uncached_inputs() {
    let directory = Directory::new();
    let hash = store(&directory.0, b"parallel cached body");
    let target = directory.0.join("target");
    let mut state = State::default();
    assert_eq!(cached_response(&directory.0, &[(hash, &target, 1, 0)], &mut state)["completed"], 1);
    store_raw(&directory.0, hash, b"now corrupt");
    let mut inputs = vec![(hash, target.as_path(), 3, 0); 64];
    assert_eq!(cached_response(&directory.0, &inputs, &mut state)["completed"], 64);
    inputs[31].2 = 1;
    assert_eq!(cached_response(&directory.0, &inputs, &mut state)["failed"], true);
    assert!(!target.exists());
}
/// Verifies that cache authority (`3`) still fails on a cache miss when the underlying disk object is corrupt.
#[test]
fn cache_authority_never_hides_invalid_disk_bytes_on_a_cache_miss() {
    let directory = Directory::new();
    let hash = store(&directory.0, b"cached elsewhere");
    store_raw(&directory.0, hash, b"now corrupt");
    let target = directory.0.join("target");
    let mut state = State::default();
    assert_eq!(cached_response(&directory.0, &[(hash, &target, 3, 0)], &mut state)["failed"], true);
    assert!(state.get(&directory.0, hash).is_none());
}

#[test]
fn wider_preflight_never_widens_the_public_write_limit() {
    let directory = Directory::new();
    let hash = store(&directory.0, b"read-only batching");
    let target = directory.0.join("target");
    let inputs = vec![(hash, target.as_path(), 1, 0); 256];
    let mut state = State::default();
    assert_eq!(cached_response(&directory.0, &inputs, &mut state)["completed"], 256);
    assert!(!target.exists());
    let mut output = Vec::new();
    assert!(
        serve(
            &mut Cursor::new(frame(&directory.0, &inputs)),
            &mut output,
            false,
            &mut state,
            pool()
        )
        .is_err(),
    );
    assert!(!target.exists());
    let too_many = vec![(hash, target.as_path(), 1, 0); 257];
    assert!(
        serve(
            &mut Cursor::new(frame(&directory.0, &too_many)),
            &mut output,
            true,
            &mut state,
            pool()
        )
        .is_err(),
    );
}
