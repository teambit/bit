//! Keep tool control separate from inherited user stdout and stderr.
use super::{Assets, LIMIT, Target, Value, discovery, invalid, json};
use std::{
    ffi::OsString,
    fs::File,
    io::{self, BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

pub(super) struct Stream {
    child: Child,
    input: Option<ChildStdin>,
    control: BufReader<TcpStream>,
    output: tempfile::NamedTempFile,
    errors: tempfile::NamedTempFile,
    assets: Assets,
}
impl Stream {
    pub(super) fn prepare(request: &Value, colors: bool, args: &[OsString]) -> io::Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let token = crate::commands::workspace_command::uuid_v4()?;
        let mut session = Self::spawn(colors, args, &listener, &token)?;
        let mut request = request.clone();
        request["assets"] = json!(session.assets.root);
        request["streamed"] = json!(true);
        let mut bytes = serde_json::to_vec(&request)?;
        if bytes.len() as u64 >= LIMIT {
            return Err(invalid("tester tool request limit"));
        }
        bytes.push(b'\n');
        session.input
            .as_mut()
            .ok_or_else(|| invalid("tester input closed"))?
            .write_all(&bytes)?;
        if session
            .read()?
            .is_none_or(|value| value["ready"] != true)
            || session.output
                .as_file()
                .metadata()?
                .len()
                != 0
            || session.errors
                .as_file()
                .metadata()?
                .len()
                != 0
        {
            return Err(invalid("tester external tool preparation"));
        }
        Ok(session)
    }
    fn spawn(
        colors: bool,
        args: &[OsString],
        listener: &TcpListener,
        token: &str,
    ) -> io::Result<Self> {
        let Target::Entry(cli) = discovery::find()? else {
            return Err(invalid("tester tool installation"));
        };
        let package =
            cli.bit_dir.ok_or_else(|| invalid("tester package root"))?.join("package.json");
        let assets = Assets::prepare(&package)?;
        let output = tempfile::NamedTempFile::new()?;
        let errors = tempfile::NamedTempFile::new()?;
        let mut child = Command::new(cli.node)
            .arg(assets.root.join("runner.cjs"))
            .arg(cli.entry)
            .args(args)
            .env("FORCE_COLOR", if colors { "1" } else { "0" })
            .env_remove("NO_COLOR")
            .env("BIT_NATIVE_TESTER_CONTROL", format!("{}:{token}", listener.local_addr()?.port()))
            .stdin(Stdio::piped())
            .stdout(output.reopen()?)
            .stderr(errors.reopen()?)
            .spawn()?;
        let input = child.stdin.take().ok_or_else(|| invalid("tester tool stdin"))?;
        let control = match accept(listener, &mut child, token) {
            Ok(control) => control,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        Ok(Self { child, input: Some(input), control, output, errors, assets })
    }
    pub(super) fn run(&mut self) -> io::Result<Value> {
        let done = Arc::new(AtomicBool::new(false));
        let stdout = tail(self.output.reopen()?, false, Arc::clone(&done));
        let stderr = tail(self.errors.reopen()?, true, Arc::clone(&done));
        let result = self.execute();
        done.store(true, Ordering::Release);
        join(stdout)?;
        join(stderr)?;
        result
    }
    fn execute(&mut self) -> io::Result<Value> {
        let mut input = self.input.take().ok_or_else(|| invalid("tester input closed"))?;
        input.write_all(b"true\n")?;
        drop(input);
        let value = self.read()?;
        let _ = self.control.get_ref().shutdown(std::net::Shutdown::Both);
        let status = self.child.wait()?;
        if status.code().is_none() {
            return Err(invalid("tester external tool failed"));
        }
        Ok(value.unwrap_or_else(|| json!({"terminated":status.code()})))
    }
    fn read(&mut self) -> io::Result<Option<Value>> {
        let mut bytes = Vec::new();
        self.control
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
}
impl Drop for Stream {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
fn accept(
    listener: &TcpListener,
    child: &mut Child,
    token: &str,
) -> io::Result<BufReader<TcpStream>> {
    listener.set_nonblocking(true)?;
    loop {
        match listener.accept() {
            Ok((stream, _)) => {
                stream.set_read_timeout(Some(Duration::from_secs(5)))?;
                let mut reader = BufReader::new(stream);
                let mut line = String::new();
                reader
                    .by_ref()
                    .take(1024)
                    .read_line(&mut line)?;
                let value: Value = serde_json::from_str(&line)?;
                if value["token"] != token {
                    return Err(invalid("tester control authentication"));
                }
                reader.get_ref().set_read_timeout(None)?;
                return Ok(reader);
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                if child.try_wait()?.is_some() {
                    return Err(invalid("tester tool exited before control"));
                }
                thread::sleep(Duration::from_millis(5));
            }
            Err(error) => return Err(error),
        }
    }
}
fn tail(mut file: File, stderr: bool, done: Arc<AtomicBool>) -> JoinHandle<io::Result<()>> {
    thread::spawn(move || {
        let mut bytes = [0; 8192];
        loop {
            let count = file.read(&mut bytes)?;
            if count > 0 {
                write_output(stderr, &bytes[..count])?;
            } else if done.load(Ordering::Acquire) {
                return Ok(());
            } else {
                thread::sleep(Duration::from_millis(5));
            }
        }
    })
}
fn write_output(stderr: bool, bytes: &[u8]) -> io::Result<()> {
    if stderr {
        let mut output = io::stderr().lock();
        output.write_all(bytes)?;
        output.flush()
    } else {
        let mut output = io::stdout().lock();
        output.write_all(bytes)?;
        output.flush()
    }
}
fn join(handle: JoinHandle<io::Result<()>>) -> io::Result<()> {
    handle.join().map_err(|_| invalid("tester output thread"))?
}
