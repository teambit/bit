//! An offline CONNECT proxy serving the published BVM request over real HTTPS.
use crate::helper::setup;
use std::{
    fs,
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
};
pub(super) struct Proxy {
    pub url: String,
    child: Child,
    journal: tempfile::TempDir,
}
impl Proxy {
    pub fn new() -> Self {
        Self::catalog(r#"[{"version":"99.0.0","stable":true,"date":"2026-01-01"}]"#)
    }
    pub fn empty() -> Self {
        Self::catalog("[]")
    }
    fn catalog(body: &str) -> Self {
        let journal = tempfile::tempdir().unwrap();
        fs::write(journal.path().join("requests"), []).unwrap();
        let mut child = spawn(body, &journal);
        let mut output = BufReader::new(child.stdout.take().unwrap());
        let mut port = String::new();
        output.read_line(&mut port).unwrap();
        let port: u16 = port
            .trim()
            .parse()
            .expect("catalog proxy did not announce its port");
        Self { url: format!("http://127.0.0.1:{port}"), child, journal }
    }
    pub fn requests(&self) -> usize {
        fs::read(self.journal.path().join("requests")).unwrap().len()
    }
}
impl Drop for Proxy {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
fn spawn(body: &str, journal: &tempfile::TempDir) -> Child {
    let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let fixtures = directory.join("../client-transfer/src/http/fixtures");
    Command::new(node())
        .arg(directory.join("tests/e2e/harmony/doctor/catalog.cjs"))
        .arg(fixtures.join("server-key.pem"))
        .arg(certificate())
        .arg(body)
        .arg(journal.path().join("requests"))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap()
}
pub(super) fn certificate() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/e2e/harmony/doctor/catalog-cert.pem")
}
fn node() -> PathBuf {
    if let Some(binary) = std::env::var_os("BIT_NODE_BINARY") {
        return binary.into();
    }
    let executable = if cfg!(windows) { "node.exe" } else { "bin/node" };
    setup::shared().node_cli
        .ancestors()
        .map(|directory| directory.join("nodejs/22.22.0").join(executable))
        .find(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from("node"))
}
