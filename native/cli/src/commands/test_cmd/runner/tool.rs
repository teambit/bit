//! Keep the external Jest process alive across native cache publication.
//!
//! Coordinates [`Assets`], [`stream`], and the Node.js Jest worker [`Child`] process.
mod stream;

use super::{Value, assets::Assets, invalid, json};
use crate::discovery::{self, Target};
use std::{
    ffi::OsString,
    fs::File,
    io::{self, BufRead, BufReader, Read, Write},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
};

pub(super) struct Session {
    inner: Inner,
}
enum Inner {
    Quiet(Quiet),
    Stream(stream::Stream),
}
impl Session {
    #[inline]
    pub(super) fn prepare(
        request: &Value,
        colors: bool,
        args: &[OsString],
        streamed: bool,
    ) -> io::Result<Self> {
        let inner = if streamed {
            Inner::Stream(stream::Stream::prepare(request, colors, args)?)
        } else {
            Inner::Quiet(Quiet::prepare(request, colors, args)?)
        };
        Ok(Self { inner })
    }
    #[inline]
    pub(super) fn run(&mut self) -> io::Result<Value> {
        match &mut self.inner {
            Inner::Quiet(session) => session.run(),
            Inner::Stream(session) => session.run(),
        }
    }
}

const LIMIT: u64 = 16 * 1024 * 1024;

struct Quiet {
    child: Child,
    input: Option<ChildStdin>,
    output: BufReader<ChildStdout>,
    errors: File,
    assets: Assets,
}

impl Quiet {
    pub(super) fn prepare(request: &Value, colors: bool, args: &[OsString]) -> io::Result<Self> {
        let mut session = Self::spawn(colors, args)?;
        let mut request = request.clone();
        request["assets"] = json!(session.assets.root);
        let mut bytes = serde_json::to_vec(&request)?;
        if bytes.len() as u64 >= LIMIT {
            return Err(invalid("tester tool request limit"));
        }
        bytes.push(b'\n');
        let stdin = session.input.as_mut().ok_or_else(|| invalid("tester input closed"))?;
        stdin.write_all(&bytes)?;
        stdin.flush()?;
        if session
            .read()?
            .is_none_or(|value| value["ready"] != true)
            || session.has_stderr()?
        {
            return Err(invalid("tester external tool preparation"));
        }
        Ok(session)
    }

    fn spawn(colors: bool, args: &[OsString]) -> io::Result<Self> {
        let Target::Entry(cli) = discovery::find()? else {
            return Err(invalid("tester tool installation"));
        };
        if is_blank_path(&cli.entry) {
            return Err(invalid("tester tool entry"));
        }
        let package = cli.bit_dir
            .filter(|dir| !is_blank_path(dir))
            .ok_or_else(|| invalid("tester package root"))?
            .join("package.json");
        let assets = Assets::prepare(&package)?;
        let errors = tempfile::tempfile()?;
        let mut child = Command::new(cli.node)
            .arg(assets.root.join("runner.cjs"))
            .arg(cli.entry)
            .args(args)
            .env("FORCE_COLOR", if colors { "1" } else { "0" })
            .env_remove("NO_COLOR")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(errors.try_clone()?)
            .spawn()?;
        let input = child.stdin.take().ok_or_else(|| invalid("tester tool stdin"))?;
        let output =
            BufReader::new(child.stdout.take().ok_or_else(|| invalid("tester tool stdout"))?);
        Ok(Self { child, input: Some(input), output, errors, assets })
    }

    pub(super) fn run(&mut self) -> io::Result<Value> {
        let mut input = self.input.take().ok_or_else(|| invalid("tester input closed"))?;
        input.write_all(b"true\n")?;
        drop(input);
        let value = self.read();
        let status = self.child.wait()?;
        let value = value?;
        if status.code().is_none() || self.has_stderr()? {
            return Err(invalid("tester external tool failed"));
        }
        Ok(value.unwrap_or_else(|| json!({"terminated": status.code()})))
    }

    fn read(&mut self) -> io::Result<Option<Value>> {
        let mut bytes = Vec::new();
        self.output
            .by_ref()
            .take(LIMIT)
            .read_until(b'\n', &mut bytes)?;
        if bytes.is_empty() {
            return Ok(None);
        }
        if bytes.last() != Some(&b'\n') {
            return Err(invalid("tester tool response limit"));
        }
        serde_json::from_slice(&bytes).map(Some).map_err(io::Error::other)
    }

    #[inline]
    fn has_stderr(&self) -> io::Result<bool> {
        Ok(self.errors.metadata()?.len() != 0)
    }
}

impl Drop for Quiet {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[inline]
pub(super) fn is_blank_path(path: &std::path::Path) -> bool {
    path.as_os_str().is_empty()
        || path
            .to_str()
            .is_some_and(|text| text.trim().is_empty())
}
