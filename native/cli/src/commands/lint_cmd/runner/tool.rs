//! Keep the external `ESLint` process alive across native cache publication.
use super::{Value, invalid};
use crate::discovery::{self, Target};
use std::{
    fs::File,
    io::{self, BufRead, BufReader, Read, Seek, SeekFrom, Write},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
};

const LIMIT: u64 = 16 * 1024 * 1024;

pub(super) struct Session {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    errors: File,
}

impl Session {
    pub(super) fn prepare(request: &Value, colors: bool) -> io::Result<Self> {
        let mut bytes = serde_json::to_vec(request)?;
        if bytes.len() as u64 >= LIMIT {
            return Err(invalid("linter tool request limit"));
        }
        bytes.push(b'\n');
        let mut session = Self::spawn(colors)?;
        session.input.write_all(&bytes)?;
        session.input.flush()?;
        if session.read()?["ready"] != true || !session.stderr()?.is_empty() {
            return Err(invalid("linter external tool preparation"));
        }
        Ok(session)
    }

    fn spawn(colors: bool) -> io::Result<Self> {
        let Target::Entry(cli) = discovery::find()? else {
            return Err(invalid("linter tool installation"));
        };
        let package =
            cli.bit_dir.ok_or_else(|| invalid("linter package root"))?.join("package.json");
        if !package.is_file() {
            return Err(invalid("linter package root"));
        }
        let errors = tempfile::tempfile()?;
        let mut child = Command::new(cli.node)
            .arg("-e")
            .arg(include_str!("tool.cjs"))
            .arg(package)
            .env("FORCE_COLOR", if colors { "1" } else { "0" })
            .env_remove("NO_COLOR")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(errors.try_clone()?)
            .spawn()?;
        let input = child.stdin.take().ok_or_else(|| invalid("linter tool stdin"))?;
        let output =
            BufReader::new(child.stdout.take().ok_or_else(|| invalid("linter tool stdout"))?);
        Ok(Self { child, input, output, errors })
    }

    pub(super) fn run(&mut self) -> io::Result<Value> {
        self.input.write_all(b"true\n")?;
        self.input.flush()?;
        let value = self.read()?;
        if !self.child.wait()?.success() || !self.stderr()?.is_empty() {
            return Err(invalid("linter external tool failed"));
        }
        Ok(value)
    }

    fn read(&mut self) -> io::Result<Value> {
        let mut bytes = Vec::new();
        self.output
            .by_ref()
            .take(LIMIT)
            .read_until(b'\n', &mut bytes)?;
        if bytes.last() != Some(&b'\n') {
            return Err(invalid("linter tool response limit"));
        }
        serde_json::from_slice(&bytes).map_err(io::Error::other)
    }

    fn stderr(&mut self) -> io::Result<Vec<u8>> {
        self.errors.seek(SeekFrom::Start(0))?;
        let mut bytes = Vec::new();
        Read::by_ref(&mut self.errors).take(LIMIT).read_to_end(&mut bytes)?;
        if bytes.iter().all(u8::is_ascii_whitespace) {
            bytes.clear();
        }
        Ok(bytes)
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
