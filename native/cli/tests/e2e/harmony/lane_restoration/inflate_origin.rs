//! Qualify the released stream's two exact corruption errors against the fixture scope.
use crate::helper::{Helper, setup};
use std::{env, path::PathBuf, process::Command};

pub(super) fn qualified_errors(helper: &Helper) -> [String; 2] {
    let package = setup::shared().node_cli
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    let output = Command::new(node())
        .args(["-e", include_str!("inflate_origin.cjs")])
        .arg(package)
        .arg(&helper.scopes.remote)
        .current_dir(&helper.scopes.local_path)
        .env("HOME", setup::shared().root.join("home"))
        .env("USERPROFILE", setup::shared().root.join("home"))
        .env("BIT_GLOBALS_DIR", setup::shared().root.join("globals"))
        .output()
        .expect("run the released ObjectFetcher stream conformance");
    assert!(
        output.status.success(),
        "released inflate-origin conformance failed: {:?}\n{}\n{}",
        output.status.code(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );
    let variants: [String; 2] = serde_json::from_slice(&output.stdout).unwrap();
    assert_ne!(variants[0], variants[1]);
    variants
}

fn node() -> PathBuf {
    if let Some(binary) = env::var_os("BIT_NODE_BINARY") {
        return binary.into();
    }
    let executable = if cfg!(windows) { "node.exe" } else { "bin/node" };
    setup::shared().node_cli
        .ancestors()
        .map(|directory| directory.join("nodejs/22.22.0").join(executable))
        .find(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from("node"))
}
