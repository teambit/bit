//! Declining confirmation leaves the native workspace untouched; acceptance restores it once.
use crate::helper::{self, Run};
use std::{io::Write, path::Path, process::Stdio};

#[test]
fn interactive_abort_confirmation_precedes_providers_and_restoration() {
    let helper = super::pending();
    for answer in ["n\n", "y\n"] {
        let oracle = helper.clone_workspace();
        let native = run(&helper.scopes.local_path, false, answer);
        let node = run(&oracle, true, answer);
        assert!(native.native, "{}", native.trace);
        assert_eq!(native.status.code(), node.status.code());
        assert_eq!(
            super::super::checkout_callbacks::stable_output(&native.stdout),
            super::super::checkout_callbacks::stable_output(&node.stdout),
            "native stderr: {}\nnative trace: {}\nNode stderr: {}",
            native.stderr,
            native.trace,
            node.stderr,
        );
        assert_eq!(native.stderr, node.stderr);
        for path in
            ["workspace.jsonc", ".bitmap", "bar/foo.js", "bar/component.json", ".bit/unmerged.json"]
        {
            assert_eq!(
                std::fs::read(helper.scopes.local_path.join(path)).unwrap(),
                std::fs::read(oracle.join(path)).unwrap(),
                "{path}",
            );
        }
        assert_eq!(
            native.stdout.matches("fixture provider startup").count(),
            usize::from(answer == "y\n"),
        );
    }
}

fn run(root: &Path, node: bool, answer: &str) -> Run {
    let mut command = helper::setup::bit_command(helper::setup::shared(), root);
    command
        .args(["lane", "merge-abort", "-x"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if node {
        command.env("BIT_NATIVE", "off");
    }
    let mut child = command.spawn().unwrap();
    child.stdin
        .take()
        .unwrap()
        .write_all(answer.as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    let stderr = String::from_utf8_lossy(&output.stderr);
    let (trace, stderr): (Vec<_>, Vec<_>) = stderr
        .lines()
        .partition(|line| line.starts_with("bit-native: "));
    Run {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: stderr.join("\n"),
        native: !trace
            .iter()
            .any(|line| line.starts_with("bit-native: delegating")),
        trace: trace.join("\n"),
        status: output.status,
    }
}
