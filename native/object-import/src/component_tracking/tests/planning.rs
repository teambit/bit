use super::{Plan, facts, fixture, options, source};
#[test]
fn tracking_is_read_only_until_commit() {
    let root = fixture();
    source(&root, "foo/index.js");
    let before = std::fs::read(root.join(".bitmap")).unwrap();
    let plan = Plan::prepare(&root, &root, &options(&["foo"]), &facts()).unwrap();
    assert_eq!(std::fs::read(root.join(".bitmap")).unwrap(), before);
    assert_eq!(plan.bitmap()["foo"]["mainFile"], "index.js");
    plan.commit("2026-10-17-12-0-0").unwrap();
    assert!(std::fs::read_to_string(root.join(".bitmap")).unwrap().contains("foo"));
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn stale_source_prevents_publication() {
    let root = fixture();
    source(&root, "foo/index.js");
    let plan = Plan::prepare(&root, &root, &options(&["foo"]), &facts()).unwrap();
    std::fs::write(root.join("foo/index.js"), "changed").unwrap();
    assert!(plan.validate().is_err());
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn multiple_components_keep_namespaces_for_duplicate_basenames() {
    let root = fixture();
    source(&root, "one/foo/index.js");
    source(&root, "two/foo/index.js");
    let plan = Plan::prepare(&root, &root, &options(&["one/foo", "two/foo"]), &facts()).unwrap();
    assert!(plan.bitmap().get("one/foo").is_some());
    assert!(plan.bitmap().get("two/foo").is_some());
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn explicit_namespaces_are_not_shortened() {
    let root = fixture();
    source(&root, "foo/index.js");
    let mut options = options(&["foo"]);
    options.namespace = Some("bar".into());
    let plan = Plan::prepare(&root, &root, &options, &facts()).unwrap();
    assert!(plan.bitmap().get("bar/foo").is_some());
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn individual_files_are_rejected() {
    let root = fixture();
    source(&root, "foo/index.js");
    assert!(
        Plan::prepare(&root, &root, &options(&["foo/index.js"]), &facts())
            .err()
            .unwrap()
            .to_string()
            .contains("adding individual files is blocked"),
    );
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn own_ignore_removes_sources() {
    let root = fixture();
    source(&root, "foo/index.js");
    source(&root, "foo/ignored.js");
    std::fs::write(root.join("foo/.bitignore"), "ignored.js\n").unwrap();
    let plan = Plan::prepare(&root, &root, &options(&["foo"]), &facts()).unwrap();
    assert!(
        !plan.components()[0]["files"]
            .as_array()
            .unwrap()
            .iter()
            .any(|file| file == "ignored.js"),
    );
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn generated_configuration_is_not_main() {
    let root = fixture();
    source(&root, "foo/index.js");
    source(&root, "foo/tsconfig.json");
    let plan = Plan::prepare(&root, &root, &options(&["foo"]), &facts()).unwrap();
    assert_eq!(plan.components()[0]["files"], serde_json::json!(["index.js"]));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn equal_names_in_different_scopes_have_distinct_keys_and_roots() {
    let root = fixture();
    source(&root, "first/index.js");
    source(&root, "second/index.js");
    let first = super::Options {
        paths: vec!["first".into()],
        id: Some("shared".into()),
        scope: Some("first.scope".into()),
        ..super::Options::default()
    };
    Plan::prepare(&root, &root, &first, &facts())
        .unwrap()
        .commit("2026-10-17-12-0-0")
        .unwrap();
    let second = super::Options {
        paths: vec!["second".into()],
        scope: Some("second.scope".into()),
        ..first
    };
    let plan = Plan::prepare(&root, &root, &second, &facts()).unwrap();
    assert_eq!(plan.bitmap()["first.scope/shared"]["rootDir"], "first");
    assert_eq!(plan.bitmap()["second.scope/shared"]["rootDir"], "second");
    assert_eq!(plan.components()[0]["identity"], "second.scope/shared");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn explicit_and_derived_ids_preserve_distinct_producer_versions() {
    let root = fixture();
    source(&root, "foo/index.js");
    let mut options = options(&["foo"]);
    let derived = Plan::prepare(&root, &root, &options, &facts()).unwrap();
    assert!(derived.components()[0]["loadVersion"].is_null());
    options.id = Some("foo".into());
    let explicit = Plan::prepare(&root, &root, &options, &facts()).unwrap();
    assert_eq!(explicit.components()[0]["loadVersion"], "latest");
    explicit.commit("2026-10-17-12-0-0").unwrap();
    options.id = None;
    let readded = Plan::prepare(&root, &root, &options, &facts()).unwrap();
    assert_eq!(readded.components()[0]["loadVersion"], "latest");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn readding_identical_sources_still_records_the_add_bitmap_history() {
    let root = fixture();
    source(&root, "foo/index.js");
    Plan::prepare(&root, &root, &options(&["foo"]), &facts())
        .unwrap()
        .commit("2026-10-17-12-0-0")
        .unwrap();
    let before = std::fs::read(root.join(".bitmap")).unwrap();
    Plan::prepare(&root, &root, &options(&["foo"]), &facts())
        .unwrap()
        .commit("2026-10-17-12-0-1")
        .unwrap();
    assert_eq!(std::fs::read(root.join(".bitmap")).unwrap(), before);
    let history = std::fs::read_to_string(root.join(".bit/bitmap-history-metadata.txt")).unwrap();
    assert_eq!(history, "2026-10-17-12-0-0 add\n2026-10-17-12-0-1 add\n");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn ignored_file_errors_keep_the_published_reverse_glob_order() {
    let root = fixture();
    source(&root, "foo/a.js");
    source(&root, "foo/z.js");
    std::fs::write(root.join("foo/.bitignore"), "*\n").unwrap();
    let error = Plan::prepare(&root, &root, &options(&["foo"]), &facts()).err().unwrap();
    let paths = if cfg!(windows) {
        r"foo\z.js, foo\a.js, foo\.bitignore"
    } else {
        "foo/z.js, foo/a.js, foo/.bitignore"
    };
    assert_eq!(
        error.to_string(),
        format!("warning: no files to add, the following files were ignored: {paths}"),
    );
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn path_globs_keep_the_published_first_invalid_file() {
    let root = fixture();
    source(&root, "AGENTS.md");
    let error = Plan::prepare(&root, &root, &options(&["*"]), &facts()).err().unwrap();
    assert!(error.to_string().contains(r#"("workspace.jsonc")"#));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn directory_variant_selects_scope_for_an_explicit_namespaced_id() {
    let root = fixture();
    source(&root, "second/index.js");
    let mut facts = facts();
    facts["workspace"]["teambit.workspace/variants"] =
        serde_json::json!({"second":{"defaultScope":"variant.direct"}});
    let mut options = options(&["second"]);
    options.id = Some("bar/second".into());
    let plan = Plan::prepare(&root, &root, &options, &facts).unwrap();
    assert_eq!(plan.bitmap()["bar/second"]["defaultScope"], "variant.direct");
    assert_eq!(plan.components()[0]["identity"], "variant.direct/bar/second");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn namespace_variants_match_component_names_independently_of_directories() {
    let root = fixture();
    source(&root, "second/index.js");
    let mut facts = facts();
    facts["workspace"]["teambit.workspace/variants"] = serde_json::json!({"*":{"defaultScope":"base.scope"},"{bar/*}":{"defaultScope":"namespace.scope"}});
    let mut options = options(&["second"]);
    options.id = Some("bar/second".into());
    let plan = Plan::prepare(&root, &root, &options, &facts).unwrap();
    assert_eq!(plan.bitmap()["bar/second"]["defaultScope"], "namespace.scope");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn explicit_scope_takes_precedence_over_matching_variants() {
    let root = fixture();
    source(&root, "second/index.js");
    let mut facts = facts();
    facts["workspace"]["teambit.workspace/variants"] =
        serde_json::json!({"second":{"defaultScope":"variant.scope"}});
    let mut options = options(&["second"]);
    options.scope = Some("explicit.scope".into());
    let plan = Plan::prepare(&root, &root, &options, &facts).unwrap();
    assert_eq!(plan.bitmap()["second"]["defaultScope"], "explicit.scope");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn shortened_generated_names_recompute_namespace_variant_scope() {
    let root = fixture();
    source(&root, "second/index.js");
    let mut facts = facts();
    facts["workspace"]["teambit.workspace/variants"] =
        serde_json::json!({"{second}":{"defaultScope":"short.scope"}});
    let plan = Plan::prepare(&root, &root, &options(&["second"]), &facts).unwrap();
    assert_eq!(plan.bitmap()["second"]["defaultScope"], "short.scope");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn readded_bitmap_default_scope_takes_precedence_over_new_variant_configuration() {
    let root = fixture();
    source(&root, "second/index.js");
    Plan::prepare(&root, &root, &options(&["second"]), &facts())
        .unwrap()
        .commit("2026-10-17-12-0-0")
        .unwrap();
    let mut facts = facts();
    facts["workspace"]["teambit.workspace/variants"] =
        serde_json::json!({"second":{"defaultScope":"changed.scope"}});
    let plan = Plan::prepare(&root, &root, &options(&["second"]), &facts).unwrap();
    assert_eq!(plan.bitmap()["second"]["defaultScope"], "scope");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn unscoped_vendor_tracking_declines_without_changing_the_workspace() {
    let root = fixture();
    source(&root, "vendor/external/index.js");
    let before = std::fs::read(root.join(".bitmap")).unwrap();
    let error =
        Plan::prepare(&root, &root, &options(&["vendor/external"]), &facts()).err().unwrap();
    assert_eq!(error.kind(), std::io::ErrorKind::Unsupported);
    assert_eq!(std::fs::read(root.join(".bitmap")).unwrap(), before);
    assert!(!root.join(".bit/bitmap-history").exists());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_configured_vendor_directory_does_not_inherit_the_workspace_scope() {
    let root = fixture();
    source(&root, "external/vendor/component/index.js");
    let mut facts = facts();
    facts["workspace"]["teambit.workspace/workspace"]["vendor"] =
        serde_json::json!({"directory":"external/vendor"});
    let error = Plan::prepare(&root, &root, &options(&["external/vendor/component"]), &facts)
        .err()
        .unwrap();
    assert_eq!(error.kind(), std::io::ErrorKind::Unsupported);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_shortened_vendor_name_can_receive_a_scope_from_its_namespace_variant() {
    let root = fixture();
    source(&root, "vendor/external/index.js");
    let mut facts = facts();
    facts["workspace"]["teambit.workspace/variants"] =
        serde_json::json!({"{external}":{"defaultScope":"scoped.vendor"}});
    let plan = Plan::prepare(&root, &root, &options(&["vendor/external"]), &facts).unwrap();
    assert_eq!(plan.components()[0]["identity"], "scoped.vendor/external");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn blocked_history_directory_does_not_prevent_bitmap_publication() {
    let root = fixture();
    source(&root, "foo/index.js");
    std::fs::write(root.join(".bit/bitmap-history"), "retain blocker").unwrap();
    let plan = Plan::prepare(&root, &root, &options(&["foo"]), &facts()).unwrap();
    plan.commit("2026-10-17-12-0-0").unwrap();
    let bitmap = crate::parse_jsonc(&std::fs::read(root.join(".bitmap")).unwrap()).unwrap();
    assert_eq!(bitmap["foo"]["rootDir"], "foo");
    assert_eq!(
        std::fs::read_to_string(root.join(".bit/bitmap-history")).unwrap(),
        "retain blocker",
    );
    assert!(!root.join(".bit/bitmap-history-metadata.txt").exists());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn failed_history_metadata_append_keeps_the_backup_and_publishes_bitmap() {
    let root = fixture();
    source(&root, "foo/index.js");
    let before = std::fs::read(root.join(".bitmap")).unwrap();
    std::fs::create_dir(root.join(".bit/bitmap-history-metadata.txt")).unwrap();
    let plan = Plan::prepare(&root, &root, &options(&["foo"]), &facts()).unwrap();
    plan.commit("2026-10-17-12-0-0").unwrap();
    let bitmap = crate::parse_jsonc(&std::fs::read(root.join(".bitmap")).unwrap()).unwrap();
    assert_eq!(bitmap["foo"]["rootDir"], "foo");
    assert_eq!(
        std::fs::read(root.join(".bit/bitmap-history/.bitmap-2026-10-17-12-0-0")).unwrap(),
        before,
    );
    assert!(root.join(".bit/bitmap-history-metadata.txt").is_dir());
    std::fs::remove_dir_all(root).unwrap();
}
