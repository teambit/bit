//! A real terminal interrupt protects acknowledged export rather than abandoning publication.
use super::{Hub, comparison, pending};
use crate::helper::setup;
use std::{
    fs,
    io::{BufRead, BufReader},
    os::unix::process::CommandExt,
    path::Path,
    process::{ChildStdout, Command, Output, Stdio},
    sync::mpsc,
    thread,
    time::Duration,
};

fn run(hub: &Hub, root: &Path, node: bool) -> Output {
    let release = hub.journal
        .parent()
        .unwrap()
        .join("interrupt-release");
    let _ = fs::remove_file(&release);
    let mut command = setup::bit_command(setup::shared(), root);
    command
        .args(["export", "--verbose"])
        .env("BIT_CONFIG_SYMPHONY_URL", &hub.url)
        .env("BIT_CONFIG_USER_TOKEN", "fixture-token")
        .env("__CUSTOM_ORIGIN", "fixture-hub")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0);
    if node {
        command.env("BIT_NATIVE", "off");
    }
    let mut child = command.spawn().unwrap();
    let (reader, progress) = output_reader(child.stdout.take().unwrap());
    if progress
        .recv_timeout(Duration::from_secs(20))
        .is_err()
    {
        let _ = child.kill();
        let _ = child.wait();
        let _ = reader.join();
        panic!("export progress must be visible before delayed acknowledgement");
    }
    let signal = Command::new("node")
        .args(["-e", "process.kill(-Number(process.argv[1]),'SIGINT')", &child.id().to_string()])
        .status()
        .unwrap();
    assert!(signal.success());
    fs::write(release, "release").unwrap();
    let mut output = child.wait_with_output().unwrap();
    output.stdout = reader.join().unwrap();
    output
}
fn output_reader(stdout: ChildStdout) -> (thread::JoinHandle<Vec<u8>>, mpsc::Receiver<()>) {
    let (ready, receiver) = mpsc::channel();
    let reader = thread::spawn(move || {
        let mut output = Vec::new();
        let mut reader = BufReader::new(stdout);
        loop {
            let mut line = Vec::new();
            if reader.read_until(b'\n', &mut line).unwrap() == 0 {
                break;
            }
            if String::from_utf8_lossy(&line).contains("fixture exporter received objects") {
                let _ = ready.send(());
            }
            output.extend(line);
        }
        output
    });
    (reader, receiver)
}
#[test]
fn sigint_during_hub_export_warns_and_publishes_once_like_node() {
    let helper = pending(false, "interrupt");
    let oracle = helper.clone_workspace();
    let backup = helper.clone_remote_scope();
    let hub = Hub::start(&helper, "interrupt");
    fs::write(&hub.journal, "").unwrap();
    let expected = run(&hub, &oracle, true);
    let remote = helper.clone_remote_scope();
    helper.restore_remote_scope(&backup);
    let actual = run(&hub, &helper.scopes.local_path, false);
    assert_eq!(actual.status.code(), expected.status.code());
    assert!(actual.status.success(), "{}", String::from_utf8_lossy(&actual.stderr));
    assert_eq!(actual.stdout, expected.stdout);
    let stderr = String::from_utf8_lossy(&actual.stderr);
    assert!(!stderr.contains("delegating:"), "{stderr}");
    assert_eq!(reported_stderr(&actual), reported_stderr(&expected));
    assert_eq!(
        String::from_utf8_lossy(&actual.stdout)
            .matches("unable to cancel the export process")
            .count(),
        1,
    );
    comparison::controls(&helper.scopes.local_path, &oracle);
    comparison::remote_objects(&helper.scopes.remote_path, &remote);
    comparison::requests(&hub.requests(), false);
}

fn reported_stderr(output: &Output) -> String {
    String::from_utf8_lossy(&output.stderr)
        .lines()
        .filter(|line| !line.starts_with("bit-native: "))
        .collect::<Vec<_>>()
        .join("\n")
}
