//! The host transport retains its private program through callbacks and removes it on failure.
use super::{Host, SCRIPT};
use crate::discovery::{NodeCli, Source};
use serde_json::json;
use std::{fs, path::PathBuf};

#[test]
fn private_host_script_is_retained_until_the_session_ends_including_callback_failures() {
    for response in [r#"{"id":1,"result":true}"#, r#"{"id":1,"error":"callback rejected"}"#] {
        let directory = tempfile::tempdir().unwrap();
        let executable =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/host/tests/transport.sh");
        fs::write(directory.path().join("response"), format!("{response}\n")).unwrap();
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
        let script = PathBuf::from(
            fs::read_to_string(directory.path().join("host-path"))
                .unwrap_or_else(|error| {
                    panic!("host path receipt missing: {error}; call returned {result:?}")
                })
                .trim(),
        );
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
