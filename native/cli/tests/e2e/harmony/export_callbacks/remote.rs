//! Callback qualification uses the released HTTP publisher, whose `ObjectList`
//! reaches `saveObjects` directly instead of the pinned broken file-pending glob.
use crate::helper::Helper;
use std::process::Child;

pub(super) struct Remote {
    child: Child,
    pub(super) url: String,
}

pub(super) fn start(helper: &Helper) -> Remote {
    use crate::helper::{config, setup};
    use std::{
        fs,
        io::{BufRead, BufReader},
        process::{Command, Stdio},
    };
    let shared = setup::shared();
    let configuration = helper.scopes.e2e_dir.join("callback-http.json");
    fs::write(
        &configuration,
        serde_json::json!({
            "scopes":{&helper.scopes.remote:helper.scopes.remote_path},"mode":"callback"
        })
        .to_string(),
    )
    .unwrap();
    let journal = helper.scopes.e2e_dir.join("callback-http.jsonl");
    let mut child = Command::new("node")
        .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/e2e/harmony/export_hub/server.cjs"))
        .args([shared.node_cli.as_os_str(), configuration.as_os_str(), journal.as_os_str()])
        .env("HOME", shared.root.join("home"))
        .env("USERPROFILE", shared.root.join("home"))
        .env("BIT_GLOBALS_DIR", shared.root.join("globals"))
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();
    let mut port = String::new();
    BufReader::new(child.stdout.take().unwrap()).read_line(&mut port).unwrap();
    assert!(!port.trim().is_empty());
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope.remove("remotes");
    });
    Remote { child, url: format!("http://127.0.0.1:{}", port.trim()) }
}

impl Drop for Remote {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
