use super::{Directory, Request};
use crate::merge_history::{MAX_RAW, invalid};
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, Read},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicUsize, Ordering},
};
#[derive(Clone, Copy)]
pub(super) struct MergeBytes<'a> {
    pub(super) current: &'a [u8],
    pub(super) base: &'a [u8],
    pub(super) other: &'a [u8],
}
struct Process(Child);
impl Drop for Process {
    fn drop(&mut self) {
        let _kill = self.0.kill();
        let _wait = self.0.wait();
    }
}
pub(super) fn git(
    index: usize,
    bytes: MergeBytes<'_>,
    request: &Request,
    directory: &Directory,
    output: &AtomicUsize,
) -> io::Result<Value> {
    let currentpath = directory.0.join(format!("{index}-current"));
    let basepath = directory.0.join(format!("{index}-base"));
    let otherpath = directory.0.join(format!("{index}-other"));
    fs::write(&currentpath, bytes.current)?;
    fs::write(&basepath, String::from_utf8_lossy(bytes.base).as_bytes())?;
    fs::write(&otherpath, String::from_utf8_lossy(bytes.other).as_bytes())?;
    let (status, stdout, stderr) = execute(
        [&request.labels.current, &request.labels.other],
        [currentpath, basepath, otherpath],
    )?;
    if output.fetch_add(stdout.len(), Ordering::Relaxed) + stdout.len() > MAX_RAW {
        return Err(invalid("merge aggregate Git output limit"));
    }
    interpret(status, &stdout, &stderr)
}
fn execute(
    labels: [&str; 2],
    paths: [PathBuf; 3],
) -> io::Result<(std::process::ExitStatus, Vec<u8>, Vec<u8>)> {
    let mut child = spawn(labels, paths)?;
    let stderr = child.0.stderr.take().ok_or_else(|| invalid("merge missing stderr"))?;
    let thread = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stderr
            .take((MAX_RAW + 1) as u64)
            .read_to_end(&mut bytes)?;
        io::Result::Ok(bytes)
    });
    let mut stdout = Vec::new();
    let result = child.0.stdout
        .take()
        .ok_or_else(|| invalid("merge missing stdout"))?
        .take((MAX_RAW + 1) as u64)
        .read_to_end(&mut stdout);
    if result.is_err() || stdout.len() > MAX_RAW {
        let _kill = child.0.kill();
    }
    let status = child.0.wait();
    let stderr = thread.join().map_err(|_| invalid("merge stderr thread failed"))??;
    result?;
    let status = status?;
    if stdout.len() > MAX_RAW || stderr.len() > MAX_RAW {
        return Err(invalid("merge Git output limit"));
    }
    Ok((status, stdout, stderr))
}
fn interpret(status: std::process::ExitStatus, stdout: &[u8], stderr: &[u8]) -> io::Result<Value> {
    let stdout = String::from_utf8_lossy(stdout).into_owned();
    if status.success() {
        Ok(json!({"output":stdout,"conflict":null}))
    } else if status
        .code()
        .is_some_and(|code| code != 0)
        && !stdout.is_empty()
    {
        Ok(json!({"output":null,"conflict":stdout}))
    } else if status.code() == Some(255)
        && String::from_utf8_lossy(stderr).contains("Cannot merge binary files")
    {
        Ok(json!({"output":null,"conflict":null,"isBinaryConflict":true}))
    } else {
        Err(invalid("Git merge failed"))
    }
}

fn spawn(labels: [&str; 2], paths: [PathBuf; 3]) -> io::Result<Process> {
    let child = Process(
        Command::new("git")
            .args(["merge-file", "-L", labels[0], "-L", "Base File", "-L", labels[1]])
            .args(paths)
            .arg("-p")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?,
    );
    Ok(child)
}

pub(crate) fn config_conflict(paths: [PathBuf; 3]) -> io::Result<String> {
    let (status, stdout, stderr) = execute(["ours", "theirs"], paths)?;
    let value = interpret(status, &stdout, &stderr)?;
    value["conflict"]
        .as_str()
        .map(str::to_owned)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| invalid("config Git merge has no conflict"))
}
