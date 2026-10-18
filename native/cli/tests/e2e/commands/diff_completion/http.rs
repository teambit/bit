use crate::helper::{Helper, config, setup};
use std::{
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::Duration,
};

pub(crate) struct Server(Child);

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

pub(crate) fn start(helper: &Helper) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let child = node_command(helper)
        .args([
            "start",
            "--port",
            &port.to_string(),
            "--skip-ui-build",
            "--no-browser",
            "--skip-compilation",
        ])
        .env("BIT_NATIVE", "off")
        .env("CI", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut server = Server(child);
    let ready = (0..300).any(|_| {
        if server.0.try_wait().unwrap().is_some() {
            return false;
        }
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(100));
        false
    });
    assert!(ready, "the pinned Node.js CLI did not start its HTTP scope server");
    config::update_scope_json(&helper.scopes.local_path.join(".bit/scope.json"), |scope| {
        scope["remotes"][&helper.scopes.remote] =
            serde_json::json!(format!("http://127.0.0.1:{port}"));
    });
    server
}

// Spawn Node itself so Child::kill terminates the server on Windows as well as Unix.
fn node_command(helper: &Helper) -> Command {
    let shared = setup::shared();
    let environment = setup::bit_command(shared, &helper.scopes.remote_path);
    let mut command = Command::new(node_binary(&shared.node_cli));
    command.arg(&shared.node_cli).current_dir(&helper.scopes.remote_path);
    for (key, value) in environment.get_envs() {
        if let Some(value) = value {
            command.env(key, value);
        } else {
            command.env_remove(key);
        }
    }
    command
}

pub(super) fn node_binary(entry: &Path) -> PathBuf {
    if let Some(node) = std::env::var_os("BIT_NODE_BINARY") {
        return node.into();
    }
    let installed = entry
        .ancestors()
        .find(|dir| dir.join("nodejs").is_dir());
    let versions = installed
        .into_iter()
        .flat_map(|dir| std::fs::read_dir(dir.join("nodejs")))
        .flatten()
        .flatten();
    let executable = if cfg!(windows) { "node.exe" } else { "bin/node" };
    versions
        .filter_map(|version| {
            let path = version.path().join(executable);
            let name = version
                .file_name()
                .to_string_lossy()
                .trim_start_matches('v')
                .to_owned();
            let key = name
                .split('.')
                .map(|part| part.parse::<u64>().unwrap_or(0))
                .collect::<Vec<_>>();
            path.is_file().then_some((key, path))
        })
        .max_by(|left, right| left.0.cmp(&right.0))
        .map_or_else(|| PathBuf::from("node"), |(_, path)| path)
}
