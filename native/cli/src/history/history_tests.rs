//! Unit tests for ISO-8601 timestamp formatting ([`iso`]) and `.bit/command-history` lifecycle logging in [`History`].
//!
//! Verifies `Date.prototype.toISOString` millisecond parity and command start/end log lines.

use super::{History, iso};
use std::{ffi::OsString, fs};
use tempfile::TempDir;

/// Verifies [`iso`] matches `JavaScript` `Date.prototype.toISOString` formatting.
///
/// Covers epoch `0`, sub-second milliseconds (`999`), arbitrary timestamps, and leap-year dates.
#[test]
fn iso_matches_javascript() {
    assert_eq!(iso(0), "1970-01-01T00:00:00.000Z");
    assert_eq!(iso(999), "1970-01-01T00:00:00.999Z");
    // new Date(1792000000123).toISOString()
    assert_eq!(iso(1_792_000_000_123), "2026-10-14T17:46:40.123Z");
    // new Date(951782400000).toISOString(): a leap day
    assert_eq!(iso(951_782_400_000), "2000-02-29T00:00:00.000Z");
}

/// Verifies that [`History::start`] and [`History::end`] append `started` and `succeeded` lines to `.bit/command-history` in [`TempDir`].
///
/// Ensures the current process ID and CLI arguments appear on both lifecycle log lines.
#[test]
fn writes_start_and_end_lines_to_the_scope() {
    let dir = TempDir::new().unwrap();
    fs::create_dir(dir.path().join(".bit")).unwrap();
    let args: Vec<OsString> = ["ms", "--json"].map(OsString::from).to_vec();
    History::start(dir.path(), &args).end(true);
    let text = fs::read_to_string(dir.path().join(".bit/command-history")).unwrap();
    let lines: Vec<_> = text.lines().collect();
    assert_eq!(lines.len(), 2);
    assert!(lines[0].ends_with(&format!(" {} ms --json, started", std::process::id())));
    assert!(lines[1].ends_with(" ms --json, succeeded"));
}
