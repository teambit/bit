use super::Options;
#[test]
fn list_precedes_archive_validation() {
    let options = Options::parse(&["--list", "--include-node-modules"]).unwrap();
    assert!(options.validate().is_ok());
    assert!(
        Options::parse(&["--include-node-modules"])
            .unwrap()
            .validate()
            .is_err(),
    );
}
#[test]
fn remote_incompatibilities_keep_published_order() {
    let options = Options::parse(&["--archive", "--include-public", "--remote", "origin"]).unwrap();
    assert_eq!(
        options.validate().unwrap_err(),
        "The following flags cannot be used with --remote: --archive, --include-public. Archive-related options are only applicable when running doctor locally.",
    );
}
#[test]
fn optional_paths_and_diagnosis_names_are_distinct() {
    let options = Options::parse(&["validate git exec", "--save", "report.txt", "-j"]).unwrap();
    assert_eq!(options.name.as_deref(), Some("validate git exec"));
    assert_eq!(options.file.unwrap().to_str(), Some("report.txt"));
    assert!(Options::parse(&["--unknown"]).is_none());
}

#[test]
fn archive_path_wins_over_save_regardless_of_argument_order() {
    for args in [
        ["--archive", "archive.tar", "--save", "save.json"],
        ["--save", "save.json", "--archive", "archive.tar"],
    ] {
        assert_eq!(
            Options::parse(&args)
                .unwrap()
                .file
                .unwrap()
                .to_str(),
            Some("archive.tar"),
        );
    }
}
