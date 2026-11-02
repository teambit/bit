//! Unit tests for `bit doctor --archive` output filenames ([`filename`]) and archive path exclusion ([`excluded`]).
//!
//! Verifies `.tar` / `.tar.gz` filename normalization and [`Options`]-driven scope/public path filtering.

use super::{excluded, filename};
use crate::commands::doctor::options::Options;
use std::path::Path;
#[test]
fn archive_extensions_and_dotted_directories_match_published_names() {
    for (input, expected) in [
        (".", "doctor-results-123.tar"),
        ("reports.v1/file.json", "reports.v1/file.tar"),
        ("out.tar.gz", "out.tar.gz"),
        ("out", "out.tar"),
    ] {
        assert_eq!(filename(Path::new(input), 123), Path::new(expected));
    }
}
#[test]
fn exclusion_keeps_scope_metadata_and_hides_only_internal_payloads() {
    let options = Options::parse(&["--archive", "--exclude-local-scope"]).unwrap();
    for path in [
        ".bit/objects/ab/hash",
        ".git/bit/cache/deps",
        ".bit/tmp/file",
        "public/file",
        "node_modules/pkg/file",
        "doctor-results-123.tar.gz",
    ] {
        assert!(excluded(Path::new(path), &options), "{path}");
    }
    for path in [
        ".bit/scope.json",
        ".bit/command-history/file",
        ".git/bit/scope.json",
        "doctor-results-custom.tar",
    ] {
        assert!(!excluded(Path::new(path), &options), "{path}");
    }
}

#[test]
fn include_public_and_node_modules_flags_retain_those_paths_in_archive() {
    let options =
        Options::parse(&["--archive", "--include-public", "--include-node-modules"]).unwrap();
    assert!(!excluded(Path::new("public/file"), &options));
    assert!(!excluded(Path::new("node_modules/pkg/file"), &options));
}
