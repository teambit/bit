use super::{EnvLinks, resolved_from_env_links};
use crate::{
    host::{CoreAspect, HostInfo},
    model::{ComponentDependencies, ComponentId, Lifecycle, PolicyEntry, WorkspaceComponent},
    policy::entries::entry,
};
use indexmap::IndexMap;
use std::{fs, path::Path};

fn component(root: &Path, scope: &str, name: &str, env_id: &str) -> WorkspaceComponent {
    WorkspaceComponent {
        id: ComponentId {
            scope: Some(scope.to_owned()),
            default_scope: None,
            name: name.to_owned(),
            version: None,
        },
        root_dir: name.to_owned(),
        dir: root.join(name),
        files: Vec::new(),
        main_file: "index.ts".to_owned(),
        package_name: format!("@{scope}/{}", name.replace('/', ".")),
        env_id: env_id.to_owned(),
        is_env: false,
        has_package_json: false,
        config: serde_json::Map::new(),
    }
}

fn from_env(name: &str) -> PolicyEntry {
    PolicyEntry { resolve_from_env: true, ..entry(name, "^1.0.0", Lifecycle::Runtime) }
}

fn package(dir: &Path) {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join("package.json"), "{}").unwrap();
}

fn dependencies(id: &str, policy: Vec<PolicyEntry>) -> IndexMap<String, ComponentDependencies> {
    IndexMap::from([(id.to_owned(), ComponentDependencies { policy, ..Default::default() })])
}

#[cfg(unix)]
#[test]
fn links_the_package_the_workspace_env_resolves() {
    let dir = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(dir.path()).unwrap();
    // The env package is a symlink into the virtual store, where its own
    // dependency lives next to it, as pnpm lays it out.
    let store = root.join("node_modules/.pnpm/my-env@1.0.0/node_modules");
    package(&store.join("@acme/my-env"));
    package(&store.join("react"));
    fs::create_dir_all(root.join("node_modules/@acme")).unwrap();
    std::os::unix::fs::symlink(store.join("@acme/my-env"), root.join("node_modules/@acme/my-env"))
        .unwrap();
    let ui = component(&root, "acme", "ui/button", "acme/my-env@1.0.0");
    let not_from_env = entry("lodash", "4.0.0", Lifecycle::Runtime);
    let deps = dependencies("acme/ui/button", vec![from_env("react"), not_from_env]);
    let EnvLinks { links, messages } =
        resolved_from_env_links(&root, &HostInfo::default(), &[ui], &deps);
    assert_eq!(
        links.into_iter().collect::<Vec<_>>(),
        [("react".to_owned(), format!("link:{}", store.join("react").display()))],
    );
    assert!(messages.is_empty());
}

#[test]
fn a_core_env_resolves_from_its_directory_in_bit() {
    let dir = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(dir.path()).unwrap();
    let bit = root.join("bit/node_modules");
    package(&bit.join("@teambit/react"));
    package(&bit.join("react-dom"));
    let info = HostInfo {
        core_aspects: vec![CoreAspect {
            id: "teambit.react/react".to_owned(),
            package_name: "@teambit/react".to_owned(),
            dir: bit.join("@teambit/react"),
        }],
        ..HostInfo::default()
    };
    let workspace = root.join("ws");
    let ui = component(&workspace, "acme", "ui", "teambit.react/react");
    let deps = dependencies("acme/ui", vec![from_env("react-dom")]);
    let EnvLinks { links, .. } = resolved_from_env_links(&workspace, &info, &[ui], &deps);
    assert_eq!(links["react-dom"], format!("link:{}", bit.join("react-dom").display()));
}

#[test]
fn reports_what_the_env_cannot_resolve() {
    let dir = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(dir.path()).unwrap();
    package(&root.join("node_modules/@acme/my-env"));
    let ui = component(&root, "acme", "ui", "acme/my-env");
    let deps = dependencies("acme/ui", vec![from_env("missing")]);
    let EnvLinks { links, messages } =
        resolved_from_env_links(&root, &HostInfo::default(), &[ui], &deps);
    assert!(links.is_empty());
    assert_eq!(
        messages,
        [format!(
            "could not resolve missing from env directory {}",
            root.join("node_modules/@acme/my-env").display(),
        )],
    );
}

#[test]
fn object_form_policies_carry_resolve_from_env() {
    let policy = crate::policy::entries::from_variant_config(
        &serde_json::json!({
            "dependencies": {
                "react": { "version": "^18.0.0", "resolveFromEnv": true },
                "lodash": "4.0.0",
            },
        }),
        &crate::policy::VariantOptions::default(),
    );
    let flags: Vec<_> = policy
        .iter()
        .map(|entry| (entry.name.as_str(), entry.resolve_from_env))
        .collect();
    assert_eq!(flags, [("react", true), ("lodash", false)]);
}
