//! The JavaScript host of native commands: the embedded `host/host.js`
//! running on the Node.js CLI's own Node, started on the first call and spoken
//! to over newline-delimited JSON. Only behavior that components and aspects
//! implement in JavaScript goes through it; the script reaches those through
//! the modules the published `@teambit/bit` package ships.

use crate::{delegate, discovery::NodeCli, trace};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    env,
    io::{self, BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{Mutex, PoisonError},
    thread,
    time::{Duration, Instant},
};

const SCRIPT: &str = include_str!("host/host.js");
const EXIT_GRACE: Duration = Duration::from_secs(5);

pub struct Host {
    cli: NodeCli,
    root: PathBuf,
    color: bool,
    session: Mutex<Option<Session>>,
}

struct Session {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

#[derive(Deserialize)]
struct Response {
    id: Option<u64>,
    result: Option<Value>,
    error: Option<String>,
}

impl Host {
    /// A host for the workspace at `root`. `color` makes the aspects' own output colored.
    pub fn new(cli: NodeCli, root: PathBuf, color: bool) -> Self {
        Self { cli, root, color, session: Mutex::new(None) }
    }

    /// Call `method` with `params`; the first call starts Node.
    pub fn call(&self, method: &str, params: &Value) -> io::Result<Value> {
        let mut guard = self.session.lock().unwrap_or_else(PoisonError::into_inner);
        let session = match &mut *guard {
            Some(session) => session,
            None => guard.insert(self.start()?),
        };
        let result = session.call(method, params);
        if result.is_err() {
            guard.take();
        }
        result
    }

    fn start(&self) -> io::Result<Session> {
        let bit_dir = self.cli.bit_dir
            .as_ref()
            .ok_or_else(|| {
                io::Error::other("the Node.js CLI entry does not belong to an @teambit/bit package")
            })?;
        let mut command = Command::new(&self.cli.node);
        command
            .arg("-e")
            .arg(SCRIPT)
            .arg(bit_dir)
            .arg(&self.cli.entry)
            .arg(&self.root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        if let Some(dir) = self.cli.node
            .parent()
            .filter(|_| self.cli.node.is_absolute() || self.cli.node.has_root())
        {
            command.env("PATH", delegate::path_with(dir, env::var_os("PATH")));
        }
        if self.color {
            command.env("FORCE_COLOR", "1");
        }
        trace::log(format!("starting the JavaScript host with {}", self.cli.node.display()));
        let mut child = command
            .spawn()
            .map_err(|error| {
                io::Error::new(error.kind(), format!("{}: {error}", self.cli.node.display()))
            })?;
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().ok_or_else(|| io::Error::other("host stdout"))?;
        Ok(Session { child, stdin, stdout: BufReader::new(stdout), next_id: 0 })
    }
}

impl Session {
    fn call(&mut self, method: &str, params: &Value) -> io::Result<Value> {
        self.next_id += 1;
        let id = self.next_id;
        let request = json!({ "id": id, "method": method, "params": params });
        let stdin = self.stdin.as_mut().ok_or_else(|| io::Error::other("host stdin closed"))?;
        writeln!(stdin, "{request}")?;
        stdin.flush()?;
        loop {
            let mut line = String::new();
            if self.stdout.read_line(&mut line)? == 0 {
                return Err(io::Error::other(format!(
                    "the JavaScript host exited during {method}",
                )));
            }
            match serde_json::from_str::<Response>(&line) {
                Ok(response) if response.id == Some(id) => return response.into_result(),
                _ => trace::log(format!("host wrote outside the protocol: {}", line.trim_end())),
            }
        }
    }
}

impl Response {
    fn into_result(self) -> io::Result<Value> {
        match self.error {
            Some(error) => Err(io::Error::other(error)),
            None => Ok(self.result.unwrap_or(Value::Null)),
        }
    }
}

/// Closing stdin ends the host's request loop; a host that does not exit by
/// itself (an aspect left a handle open) is killed.
impl Drop for Session {
    fn drop(&mut self) {
        self.stdin.take();
        let deadline = Instant::now() + EXIT_GRACE;
        while Instant::now() < deadline {
            if self.child.try_wait().map_or(true, |status| status.is_some()) {
                return;
            }
            thread::sleep(Duration::from_millis(20));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
