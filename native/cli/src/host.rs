//! The JavaScript host of native commands: the embedded `host/host.js`
//! running on the Node.js CLI's own Node, started on the first call and spoken
//! to over newline-delimited JSON. Only behavior that components and aspects
//! implement in JavaScript goes through it; the script reaches those through
//! the modules the published `@teambit/bit` package ships.

pub(crate) mod callback_error;

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

const SCRIPT: &str = concat!(
    include_str!("host/host.js"),
    "\n",
    include_str!("host/snapshot.js"),
    "\n",
    include_str!("host/export.js"),
    "\n",
    include_str!("host/rename/tooling.js"),
    "\n",
    include_str!("host/rename/ast.js"),
    "\n",
    include_str!("host/rename/config.js"),
    "\n",
    include_str!("host/rename/cache.js"),
    "\n",
    include_str!("host/fork.js"),
    "\n",
    include_str!("host/import.js"),
    "\n",
    include_str!("host/directory_identity.js"),
    "\n",
    include_str!("host/switch.js"),
);
const EXIT_GRACE: Duration = Duration::from_secs(5);

pub struct Host {
    cli: NodeCli,
    root: PathBuf,
    color: bool,
    session: Mutex<Option<Session>>,
    failed_stdout: Mutex<String>,
}

struct Session {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
    captured_stdout: String,
    stderr_finished: std::sync::mpsc::Receiver<()>,
    _script: tempfile::TempPath,
}

#[derive(Deserialize)]
struct Response {
    id: Option<u64>,
    result: Option<Value>,
    error: Option<String>,
    stdout: Option<String>,
}

impl Host {
    /// A host for the workspace at `root`. `color` makes the aspects' own output colored.
    pub fn new(cli: NodeCli, root: PathBuf, color: bool) -> Self {
        Self {
            cli,
            root,
            color,
            session: Mutex::new(None),
            failed_stdout: Mutex::new(String::new()),
        }
    }

    /// Call `method` with `params`; the first call starts Node.
    pub fn call(&self, method: &str, params: &Value) -> io::Result<Value> {
        let mut guard = self.session.lock().unwrap_or_else(PoisonError::into_inner);
        let session = match &mut *guard {
            Some(session) => session,
            None => guard.insert(self.start()?),
        };
        let started = std::time::Instant::now();
        let result = session.call(method, params);
        trace::log(format!("host {method} took {} ms", started.elapsed().as_millis()));
        if result.is_err() {
            self.failed_stdout
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push_str(&std::mem::take(&mut session.captured_stdout));
            guard.take();
        }
        result
    }

    /// Output emitted while loading aspects and serving callback facts.
    pub fn take_stdout(&self) -> String {
        // `call` holds session before failed_stdout on transport failure.
        let mut guard = self.session.lock().unwrap_or_else(PoisonError::into_inner);
        let mut output =
            std::mem::take(&mut *self.failed_stdout.lock().unwrap_or_else(PoisonError::into_inner));
        if let Some(session) = guard.as_mut() {
            output.push_str(&std::mem::take(&mut session.captured_stdout));
        }
        output
    }

    fn configure(&self, command: &mut Command) -> io::Result<()> {
        command.env("BIT_NATIVE_HOST_PROGRESS", progress_mode());
        command.env(
            "BIT_NATIVE_HOST_ARGUMENTS",
            serde_json::to_string(&env::args().skip(1).collect::<Vec<_>>())
                .map_err(io::Error::other)?,
        );
        if let Some(dir) = self.cli.node
            .parent()
            .filter(|_| self.cli.node.is_absolute() || self.cli.node.has_root())
        {
            command.env("PATH", delegate::path_with(dir, env::var_os("PATH")));
        }
        if self.color {
            command.env("FORCE_COLOR", "1");
        }
        Ok(())
    }

    fn start(&self) -> io::Result<Session> {
        let bit_dir = self.cli.bit_dir
            .as_ref()
            .ok_or_else(|| {
                io::Error::other("the Node.js CLI entry does not belong to an @teambit/bit package")
            })?;
        let script = program()?;
        let mut command = Command::new(&self.cli.node);
        self.configure(&mut command)?;
        command
            .arg(&script)
            .arg(bit_dir)
            .arg(&self.cli.entry)
            .arg(&self.root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        trace::log(format!("starting the JavaScript host with {}", self.cli.node.display()));
        let mut child = command
            .spawn()
            .map_err(|error| {
                io::Error::new(error.kind(), format!("{}: {error}", self.cli.node.display()))
            })?;
        let stderr_finished = forward_stderr(&mut child)?;
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().ok_or_else(|| io::Error::other("host stdout"))?;
        Ok(Session {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_id: 0,
            captured_stdout: String::new(),
            stderr_finished,
            _script: script,
        })
    }
}

fn program() -> io::Result<tempfile::TempPath> {
    let mut script = tempfile::Builder::new()
        .prefix("bit-native-host-")
        .suffix(".cjs")
        .tempfile()?;
    script.write_all(SCRIPT.as_bytes())?;
    Ok(script.into_temp_path())
}

impl Session {
    fn call(&mut self, method: &str, params: &Value) -> io::Result<Value> {
        self.next_id += 1;
        let id = self.next_id;
        let request = json!({ "id": id, "method": method, "params": params });
        let stdin = self.stdin.as_mut().ok_or_else(|| io::Error::other("host stdin closed"))?;
        let mut frame = serde_json::to_vec(&request)?;
        frame.push(b'\n');
        stdin.write_all(&frame)?;
        stdin.flush()?;
        loop {
            let mut line = String::new();
            if self.stdout.read_line(&mut line)? == 0 {
                return Err(io::Error::other(format!(
                    "the JavaScript host exited during {method}",
                )));
            }
            match serde_json::from_str::<Response>(&line) {
                Ok(response) if response.id == Some(id) => {
                    if let Some(stdout) = &response.stdout {
                        self.captured_stdout.push_str(stdout);
                    }
                    return response.into_result();
                }
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
        self.stop();
        let _ = self.stderr_finished.recv_timeout(Duration::from_millis(100));
    }
}

impl Session {
    fn stop(&mut self) {
        self.stdin.take();
        let deadline = Instant::now() + EXIT_GRACE;
        while Instant::now() < deadline {
            if self.child.try_wait().map_or(true, |status| status.is_some()) {
                return;
            }
            thread::sleep(Duration::from_millis(1));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Serialize complete host stderr lines with Rust tracing, preserving their bytes.
fn forward_stderr(child: &mut Child) -> io::Result<std::sync::mpsc::Receiver<()>> {
    let stderr = child.stderr.take().ok_or_else(|| io::Error::other("host stderr"))?;
    let (finished, receiver) = std::sync::mpsc::channel();
    let _reader = thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut line = Vec::new();
        while reader
            .read_until(b'\n', &mut line)
            .is_ok_and(|length| length > 0)
        {
            let _ = io::stderr().lock().write_all(&line);
            line.clear();
        }
        let _ = finished.send(());
    });
    Ok(receiver)
}

fn progress_mode() -> &'static str {
    let progress = env::args()
        .nth(1)
        .is_some_and(|arg| matches!(arg.as_str(), "status" | "s" | "diff" | "d"))
        && !env::args().any(|arg| matches!(arg.as_str(), "--json" | "-j"))
        && env::var_os("CI").is_none();
    if progress { "1" } else { "0" }
}

#[cfg(test)]
mod path_tests;

#[cfg(all(test, unix))]
mod tests;
