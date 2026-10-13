use super::{MAX_OUTPUT, MAX_RAW, count, expected_hash, hash, invalid, path, read};
mod workers;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicUsize, Ordering},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct InputFile {
    relative_path: String,
    left: Option<Input>,
    right: Option<Input>,
}
#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum Input {
    Source { objects_directory: PathBuf, hash: String },
    Workspace { path: PathBuf, hash: String },
}
struct Prepared {
    relative_path: String,
    left: Vec<u8>,
    right: Vec<u8>,
    same: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileDiff {
    relative_path: String,
    from_content: String,
    to_content: String,
    raw_diff: String,
    same: bool,
}
impl FileDiff {
    pub(crate) fn raw(self) -> serde_json::Value {
        serde_json::json!({"relativePath":self.relative_path,"rawDiff":self.raw_diff,"same":self.same})
    }
}
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Directory(PathBuf);
impl Directory {
    fn new() -> io::Result<Self> {
        for _ in 0..64 {
            let directory = std::env::temp_dir()
                .join(format!(
                    "bit-workspace-diff-{}-{}",
                    std::process::id(),
                    NEXT.fetch_add(1, Ordering::Relaxed),
                ));
            match fs::create_dir(&directory) {
                Ok(()) => return Ok(Self(directory)),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error),
            }
        }
        Err(invalid("workspace diff temporary directory unavailable"))
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _cleanup = fs::remove_dir_all(&self.0);
    }
}
struct Process(Child);
impl Drop for Process {
    fn drop(&mut self) {
        let _kill = self.0.kill();
        let _wait = self.0.wait();
    }
}

pub(super) fn diff(files: &[InputFile], git: &str, color: bool) -> io::Result<Vec<FileDiff>> {
    count(files.len())?;
    if git.is_empty() || git.len() > 32768 || git.contains('\0') {
        return Err(invalid("workspace invalid Git executable"));
    }
    let prepared = preflight(files)?;
    if prepared.is_empty() {
        return Ok(Vec::new());
    }
    execute(&prepared, git, color)
}
pub(crate) type Frozen = (String, Option<Vec<u8>>, Option<Vec<u8>>);
pub(crate) fn frozen(files: Vec<Frozen>, git: &str, color: bool) -> io::Result<Vec<FileDiff>> {
    if git.is_empty() || git.len() > 32768 || git.contains('\0') {
        return Err(invalid("workspace invalid Git executable"));
    }
    let prepared = files
        .into_iter()
        .map(|(relative_path, left, right)| {
            let same = equivalent(left.as_deref(), right.as_deref());
            Prepared {
                relative_path,
                left: left.unwrap_or_default(),
                right: right.unwrap_or_default(),
                same,
            }
        })
        .collect::<Vec<_>>();
    if prepared.is_empty() {
        return Ok(Vec::new());
    }
    execute(&prepared, git, color)
}
fn execute(prepared: &[Prepared], git: &str, color: bool) -> io::Result<Vec<FileDiff>> {
    let directory = prepared
        .iter()
        .any(|file| !file.same)
        .then(Directory::new)
        .transpose()?;
    let output = AtomicUsize::new(0);
    let run = |(index, file)| {
        one(file, index, directory.as_ref().map(|value| value.0.as_path()), git, color, &output)
    };
    if prepared.len() < 2
        || rayon::current_thread_index().is_none()
        || rayon::current_num_threads() == 1
    {
        return prepared
            .iter()
            .enumerate()
            .map(run)
            .collect();
    }
    workers::execute(
        prepared,
        directory.as_ref().map(|value| value.0.as_path()),
        git,
        color,
        &output,
    )
}

fn equivalent(left: Option<&[u8]>, right: Option<&[u8]>) -> bool {
    left == right || left.map(linux_hash) == right.map(linux_hash)
}
fn linux_hash(bytes: &[u8]) -> String {
    if bytes.contains(&b'\r') {
        hash(&crate::checkout::eol::normalize(bytes.to_vec(), false))
    } else {
        hash(bytes)
    }
}

fn preflight(files: &[InputFile]) -> io::Result<Vec<Prepared>> {
    let mut total = 0;
    let mut compressed = 0;
    let mut prepared = Vec::with_capacity(files.len());
    for file in files {
        if file.relative_path.len() > 32768 || file.relative_path.contains('\0') {
            return Err(invalid("workspace invalid relative path"));
        }
        let left = input(file.left.as_ref(), &mut total, &mut compressed)?;
        let right = input(file.right.as_ref(), &mut total, &mut compressed)?;
        let same = equivalent(
            file.left.as_ref().map(|_| left.as_slice()),
            file.right.as_ref().map(|_| right.as_slice()),
        );
        prepared.push(Prepared { relative_path: file.relative_path.clone(), left, right, same });
    }
    Ok(prepared)
}
fn input(input: Option<&Input>, total: &mut usize, compressed: &mut usize) -> io::Result<Vec<u8>> {
    let Some(input) = input else {
        return Ok(Vec::new());
    };
    let bytes = match input {
        Input::Source { objects_directory, hash } => {
            path(objects_directory)?;
            crate::checkout::repository::source(
                objects_directory,
                expected_hash(hash)?,
                MAX_RAW - *total,
                compressed,
            )?
        }
        Input::Workspace { path, hash: expected } => {
            expected_hash(expected)?;
            let bytes = read::raw(path, MAX_RAW - *total)?;
            if hash(&bytes) != *expected {
                return Err(invalid("workspace snapshot changed"));
            }
            *total += bytes.len();
            return Ok(read::strip_bom(bytes));
        }
    };
    *total += bytes.len();
    Ok(bytes)
}
fn one(
    file: &Prepared,
    index: usize,
    directory: Option<&Path>,
    git: &str,
    color: bool,
    output: &AtomicUsize,
) -> io::Result<FileDiff> {
    let raw_diff = if file.same {
        String::new()
    } else {
        let directory = directory.ok_or_else(|| invalid("workspace diff directory missing"))?;
        let left = directory.join(format!("{index}-left.js"));
        let right = directory.join(format!("{index}-right.js"));
        fs::write(&left, &file.left)?;
        fs::write(&right, &file.right)?;
        git_diff(git, &left, &right, color)?
    };
    if output.fetch_add(raw_diff.len(), Ordering::Relaxed) + raw_diff.len() > MAX_OUTPUT {
        return Err(invalid("workspace Git output limit"));
    }
    Ok(FileDiff {
        relative_path: file.relative_path.clone(),
        from_content: String::from_utf8_lossy(&file.left).into_owned(),
        to_content: String::from_utf8_lossy(&file.right).into_owned(),
        raw_diff,
        same: file.same,
    })
}
fn git_diff(git: &str, left: &Path, right: &Path, color: bool) -> io::Result<String> {
    let mut command = Command::new(git);
    command.args(["diff", "--no-index"]);
    if color {
        command.arg("--color");
    }
    command
        .arg(left)
        .arg(right)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = Process(command.spawn()?);
    let mut bytes = Vec::new();
    child.0.stdout
        .take()
        .ok_or_else(|| invalid("workspace Git stdout missing"))?
        .take((MAX_RAW + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_RAW {
        return Err(invalid("workspace Git stdout limit"));
    }
    let status = child.0.wait()?;
    if status.code().is_none() || (!status.success() && bytes.is_empty()) {
        return Err(invalid("workspace Git diff failed"));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod tests;
