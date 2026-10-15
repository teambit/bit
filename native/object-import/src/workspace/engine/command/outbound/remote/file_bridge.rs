//! A narrow persistent bridge to the installed file-scope server actions.
//! Rust owns ordering and retry policy; the canonical server still merges.
use serde_json::{Value, json};
use std::{
    io::{self, BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
};

const MAX_REPLY_BYTES: usize = 4 * 1024 * 1024;
const SCRIPT: &str = r"
const readline = require('node:readline');
const bitDir = process.argv[1];
const protocolWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (...args) => process.stderr.write(...args);
const reply = value => protocolWrite(JSON.stringify(value) + '\n');
let action;
try {
  action = require(require.resolve('@teambit/legacy.scope-api', { paths: [bitDir] })).action;
  if (typeof action !== 'function') throw new Error('scope action module missing');
  reply({ ready: true });
} catch (error) {
  reply({ ready: false, message: String(error.message || error) });
  process.exit(1);
}
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let queue = Promise.resolve();
lines.on('line', line => {
  queue = queue.then(async () => {
    try {
      const request = JSON.parse(line);
      const value = await action(request.path, request.name, request.options);
      reply({ ok: true, value: value ?? {} });
    } catch (error) {
      reply({ ok: false, message: String(error.message || error) });
    }
  });
});
lines.on('close', () => queue.then(() => process.exit(0)));
";

pub(super) struct FileBridge {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
}

impl FileBridge {
    pub(super) fn spawn(node: &Path, bit_dir: &Path) -> io::Result<Self> {
        let mut child = Command::new(node)
            .args(["-e", SCRIPT])
            .arg(bit_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let input = child.stdin.take().ok_or_else(|| io::Error::other("file bridge stdin"))?;
        let output = child.stdout.take().ok_or_else(|| io::Error::other("file bridge stdout"))?;
        let mut bridge = Self { child, input, output: BufReader::new(output) };
        let greeting = bridge.read_reply()?;
        if greeting["ready"] != true {
            return Err(io::Error::other(format!(
                "file action bridge startup: {}",
                greeting["message"].as_str().unwrap_or("invalid reply"),
            )));
        }
        Ok(bridge)
    }

    pub(super) fn call(&mut self, path: &Path, name: &str, options: &Value) -> io::Result<Value> {
        let request = json!({ "path": path, "name": name, "options": options });
        let mut bytes = serde_json::to_vec(&request)?;
        if bytes.len() >= MAX_REPLY_BYTES {
            return Err(io::Error::other("file action request exceeds bounds"));
        }
        bytes.push(b'\n');
        self.input.write_all(&bytes)?;
        self.input.flush()?;
        let reply = self.read_reply()?;
        match reply["ok"].as_bool() {
            Some(true) => Ok(reply["value"].clone()),
            Some(false) => Err(io::Error::other(
                reply["message"]
                    .as_str()
                    .unwrap_or("file action failed")
                    .to_owned(),
            )),
            None => Err(io::Error::other("file action bridge reply")),
        }
    }

    fn read_reply(&mut self) -> io::Result<Value> {
        let mut line = Vec::new();
        loop {
            let available = self.output.fill_buf()?;
            if available.is_empty() {
                return Err(io::Error::other("file action bridge exited"));
            }
            let length = available
                .iter()
                .position(|byte| *byte == b'\n')
                .map_or(available.len(), |index| index + 1);
            if line.len() + length > MAX_REPLY_BYTES {
                return Err(io::Error::other("file action reply exceeds bounds"));
            }
            line.extend_from_slice(&available[..length]);
            self.output.consume(length);
            if line.last() == Some(&b'\n') {
                return serde_json::from_slice(&line).map_err(io::Error::other);
            }
        }
    }
}

impl Drop for FileBridge {
    fn drop(&mut self) {
        // All server actions have acknowledged by this point. Reap even when
        // a loaded server module has left background timers running.
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[cfg(test)]
mod tests;
