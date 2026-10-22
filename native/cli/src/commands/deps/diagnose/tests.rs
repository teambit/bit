use super::{PackageCopy, PackageReport, parse_copy, render};
use crate::commands::color::Chalk;

#[test]
fn parses_peer_suffix() {
    let copy = parse_copy("1.2.3_@scope+peer@4.0.0_react@18.0.0");
    assert_eq!(copy.version, "1.2.3");
    assert_eq!(copy.peer_suffix.as_deref(), Some("@scope/peer@4.0.0 + react@18.0.0"));
}

#[test]
fn groups_copies_by_version() {
    let report = PackageReport {
        package_name: "foo",
        pnpm_dirs: vec![
            PackageCopy { version: "1.0.0".into(), peer_suffix: None },
            PackageCopy { version: "1.0.0".into(), peer_suffix: Some("bar@2.0.0".into()) },
        ],
    };
    let rendered = render(&report, Chalk::new(false));
    assert!(rendered.contains("foo@1.0.0 — 2 copies"));
}
