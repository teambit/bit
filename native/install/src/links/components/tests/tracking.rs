//! Ordered tracking publication barriers independent of filesystem completion races in the CLI.
use super::{ComponentLinkOptions, FakeHost, component, write_sources};
use crate::{links::link_tracking_components, model::WorkspaceComponent};
use indexmap::IndexMap;
use std::{fs, io, path::Path};

fn run(root: &Path, components: &[WorkspaceComponent], host: &FakeHost) -> io::Result<()> {
    let dependencies = IndexMap::new();
    let roots = root.join("node_modules/.bit_roots");
    let options = ComponentLinkOptions {
        has_root_components: false,
        root_components_dir: &roots,
        dependencies: &dependencies,
        cloud_domain: "bit.cloud",
        windows: cfg!(windows),
        aspect_env_ids: &[],
    };
    tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap()
        .block_on(link_tracking_components(root, components, host, &options))?;
    Ok(())
}

#[test]
fn second_transformer_failure_precedes_every_package_and_source_link() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let components =
        [component(root, "first", &["index.ts"]), component(root, "second", &["index.ts"])];
    for row in &components {
        write_sources(row);
    }
    let host = FakeHost { reject: Some("org.scope/second".into()), ..Default::default() };
    let error = run(root, &components, &host).unwrap_err();
    assert_eq!(error.to_string(), "fixture rejected package");
    assert_eq!(*host.transforms.lock().unwrap(), ["org.scope/first", "org.scope/second"]);
    assert!(!root.join("node_modules").exists());
    for row in &components {
        assert_eq!(fs::read_to_string(row.dir.join("index.ts")).unwrap(), "index.ts");
    }
}

#[test]
fn second_manifest_failure_retains_first_manifest_before_any_source_links() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let components =
        [component(root, "first", &["index.ts"]), component(root, "second", &["index.ts"])];
    for row in &components {
        write_sources(row);
    }
    let blocked = root.join("node_modules/@org/scope.second/package.json");
    fs::create_dir_all(&blocked).unwrap();
    assert!(run(root, &components, &FakeHost::default()).is_err());
    assert!(root.join("node_modules/@org/scope.first/package.json").is_file());
    assert!(!root.join("node_modules/@org/scope.first/index.ts").exists());
    assert!(blocked.is_dir());
}
