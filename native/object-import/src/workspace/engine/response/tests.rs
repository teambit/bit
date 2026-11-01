//! Unit tests for [`canonical`] error progress retention ([`with_progress`], [`failure_data`]) in workspace responses.

use super::{canonical, failure_data, is_canonical, with_progress};
use serde_json::json;
use std::io;

#[test]
fn canonical_failure_retains_actual_progress_without_changing_message_or_class() {
    let progress = json!({"bitmapCount":2,"imports":[{"ids":["scope/comp"]}]});
    let error = with_progress(canonical("published failure".into()), progress.clone());
    assert!(is_canonical(&error));
    assert_eq!(error.to_string(), "published failure");
    assert_eq!(failure_data(&error), Some(json!({"progress":progress})));
    let unsupported = with_progress(io::Error::other("unsupported"), json!({}));
    assert!(!is_canonical(&unsupported));
    assert!(failure_data(&unsupported).is_none());
}

#[test]
fn plain_canonical_error_without_progress_has_no_failure_data() {
    let error = canonical("simple failure".into());
    assert!(is_canonical(&error));
    assert_eq!(error.to_string(), "simple failure");
    assert!(failure_data(&error).is_none());
}
