//! Unit tests for separating [`automatic`], [`normalized`], and [`projection`] forced merge dependency policies in `bit-object-import`.
//!
//! Verifies that automatic dependency entries are extracted via [`automatic`] and [`normalized`] without mutating persisted merge config in `bit-object-import`.

use super::{automatic, normalized, projection};
use serde_json::json;

/// Verifies that [`automatic`] and [`normalized`] separate automatic from forced [`projection::RESOLVER`] dependency policies without mutating merged JSON.
#[test]
fn separates_automatic_policy_without_mutating_persisted_merge_config() {
    let merged = json!({projection::RESOLVER:{"policy":{
        "dependencies":[{"name":"runtime","version":"^2","force":false}],
        "devDependencies":[{"name":"forced","version":"^3","force":true},{"name":"auto","version":"^4","force":false}]
    }}});
    assert_eq!(automatic(&merged).unwrap(), json!([{"runtime":"^2"},{"auto":"^4"},{}]));
    assert_eq!(
        normalized(&merged).unwrap(),
        json!({projection::RESOLVER:{"policy":{"devDependencies":{"forced":"^3"}}}}),
    );
    assert!(merged[projection::RESOLVER]["policy"]["dependencies"].is_array());
}
