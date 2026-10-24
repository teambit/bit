use super::{Helper, remote_parity_with, remote_versions};

pub(super) fn publish_remote_fixture(helper: &Helper) {
    if cfg!(windows) {
        // The pinned server's Repository.listRefs uses a Windows glob pattern that finds
        // no pending objects. Seed the same canonical object bytes directly; remote diff
        // still exercises its real file/HTTP fetch and publication protocol.
        seed_remote_fixture(helper);
    } else {
        helper.run("export");
    }
}

fn seed_remote_fixture(helper: &Helper) {
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = crate::helper::config::read_jsonc(&bitmap_path);
    for row in bitmap
        .as_object_mut()
        .unwrap()
        .values_mut()
        .filter(|row| row.get("rootDir").is_some())
    {
        row["scope"] = serde_json::json!(helper.scopes.remote);
        row.as_object_mut()
            .unwrap()
            .remove("defaultScope");
    }
    std::fs::write(bitmap_path, serde_json::to_vec_pretty(&bitmap).unwrap()).unwrap();
    let scope = helper.scopes.local_path.join(".bit");
    crate::helper::setup::copy_dir(
        &scope.join("objects"),
        &helper.scopes.remote_path.join("objects"),
    );
    std::fs::copy(scope.join("index.json"), helper.scopes.remote_path.join("index.json")).unwrap();
}

#[test]
fn canonically_seeded_remote_versions_diff_matches_node() {
    remote_parity_with(&remote_versions(seed_remote_fixture), "diff bar/foo 0.0.1 0.0.2 --json");
}

#[cfg(windows)]
#[test]
fn pinned_windows_repository_list_refs_omits_existing_pending_objects() {
    let helper = remote_versions(seed_remote_fixture);
    let shared = crate::helper::setup::shared();
    let script = r#"const {createRequire}=require('node:module');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const req=createRequire(process.argv[1]);
const {Repository}=req('@teambit/objects');
const directory=process.argv[2];
assert(fs.readdirSync(directory).length>0);
Repository.prototype.listRefs.call({},directory).then(refs=>assert.deepEqual(refs,[])).catch(error=>{console.error(error);process.exit(1)});"#;
    let output = std::process::Command::new(super::http::node_binary(&shared.node_cli))
        .arg("-e")
        .arg(script)
        .arg(&shared.node_cli)
        .arg(helper.scopes.remote_path.join("objects"))
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
}
