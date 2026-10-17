//! New-component stash checkout preserves embedded scopes and existing authored identities.
use super::support::{command, compare_stashes, node, workspace};
use crate::helper::config;
use std::fs;

#[test]
fn embedded_scope_restores_new_components_without_creating_model_heads() {
    let helper = workspace();
    fs::create_dir(helper.scopes.local_path.join(".git")).unwrap();
    fs::rename(helper.scopes.local_path.join(".bit"), helper.scopes.local_path.join(".git/bit"))
        .unwrap();
    helper.output_file("nested/new/index.js", "module.exports='saved';\n");
    helper.run("add nested/new -i fresh/component");
    let oracle = helper.clone_workspace();
    let index = fs::read(helper.scopes.local_path.join(".git/bit/index.json")).unwrap();
    command(&helper, &oracle, "stash save --include-new");
    compare_stashes(&helper.scopes.local_path, &oracle);
    command(&helper, &oracle, "stash load");
    assert_eq!(fs::read(helper.scopes.local_path.join(".git/bit/index.json")).unwrap(), index);
    assert_eq!(
        fs::read(helper.scopes.local_path.join("nested/new/index.js")).unwrap(),
        fs::read(oracle.join("nested/new/index.js")).unwrap(),
    );
    let package = format!("node_modules/@{}/fresh.component/package.json", helper.scopes.remote);
    let manifest = fs::read(helper.scopes.local_path.join(&package)).unwrap();
    assert_eq!(manifest, fs::read(oracle.join(&package)).unwrap());
    let manifest: serde_json::Value = serde_json::from_slice(&manifest).unwrap();
    assert!(manifest.get("version").is_none());
    assert!(!helper.scopes.local_path.join(".bit").exists());
    assert!(!helper.scopes.local_path.join(".git/bit/stash/stash-1.json").exists());
}

#[test]
fn existing_new_identity_is_skipped_without_replacing_its_root_or_sources() {
    let helper = workspace();
    helper.output_file("saved/new/index.js", "module.exports='saved';\n");
    helper.run("add saved/new -i fresh/component");
    let oracle = helper.clone_workspace();
    command(&helper, &oracle, "stash save --include-new");
    for root in [&helper.scopes.local_path, &oracle] {
        fs::create_dir_all(root.join("replacement/new")).unwrap();
        fs::write(root.join("replacement/new/index.js"), "module.exports='replacement';\n")
            .unwrap();
        let result = node(root, "add replacement/new -i fresh/component");
        assert!(result.status.success(), "{}", result.stderr);
    }
    let bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    command(&helper, &oracle, "stash load");
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), bitmap);
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("replacement/new/index.js")).unwrap(),
        "module.exports='replacement';\n",
    );
    assert!(!helper.scopes.local_path.join("saved/new").exists());
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap"))["fresh/component"]["rootDir"],
        "replacement/new",
    );
    assert!(!helper.scopes.local_path.join(".bit/stash/stash-1.json").exists());
}
