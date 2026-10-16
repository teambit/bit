//! The host transport retains its private program through callbacks and removes it on failure.
use super::{Host, SCRIPT};
use crate::discovery::{NodeCli, Source};
use serde_json::json;
use std::{fs, os::unix::fs::PermissionsExt, path::PathBuf};

#[test]
fn private_host_script_is_retained_until_the_session_ends_including_callback_failures() {
    for response in [r#"{"id":1,"result":true}"#, r#"{"id":1,"error":"callback rejected"}"#] {
        let directory = tempfile::tempdir().unwrap();
        let executable = directory.path().join("fake-node");
        fs::write(&executable, format!("#!/bin/sh\n[ -s \"$1\" ] || exit 2\nprintf '%s\\n' \"$1\" > \"$4/host-path\"\nIFS= read -r request\nprintf '%s\\n' '{response}'\nIFS= read -r end\n")).unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
        let host = Host::new(
            NodeCli {
                entry: directory.path().join("entry"),
                node: executable,
                bit_dir: Some(directory.path().to_path_buf()),
                bvm_link: None,
                source: Source::Env,
            },
            directory.path().to_path_buf(),
            false,
        );
        let result = host.call("fixture", &json!({}));
        let script =
            PathBuf::from(fs::read_to_string(directory.path().join("host-path")).unwrap().trim());
        assert_eq!(script.extension().unwrap(), "cjs");
        if response.contains("error") {
            assert_eq!(result.unwrap_err().to_string(), "callback rejected");
            assert!(!script.exists());
        } else {
            assert_eq!(result.unwrap(), true);
            assert_eq!(fs::read_to_string(&script).unwrap(), SCRIPT);
            drop(host);
            assert!(!script.exists());
        }
    }
}
