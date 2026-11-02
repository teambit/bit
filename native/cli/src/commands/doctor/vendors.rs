//! External executable [`version`] and [`examine`] facts ([`Diagnosis`]); all diagnosis policy remains native.
use super::catalog::Diagnosis;
use serde_json::{Value, json};
use std::process::Command;
/// Runs `command` with `argument` and returns its trimmed stdout version string when successful.
#[inline]
pub(super) fn version(command: &str, argument: &str, clean_stderr: bool) -> Option<String> {
    let output = Command::new(executable(command))
        .arg(argument)
        .output()
        .ok()?;
    if !output.status.success() || (clean_stderr && !strip_final_newline(&output.stderr).is_empty())
    {
        return None;
    }
    let raw = String::from_utf8_lossy(strip_final_newline(&output.stdout));
    let trimmed = raw.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}
#[inline]
fn strip_final_newline(mut bytes: &[u8]) -> &[u8] {
    while let Some(stripped) = bytes
        .strip_suffix(b"\n")
        .or_else(|| bytes.strip_suffix(b"\r"))
    {
        bytes = stripped;
    }
    bytes
}
pub(super) fn examine(diagnosis: &Diagnosis, git: &str) -> Value {
    let git = Some(git.trim())
        .filter(|path| !path.is_empty())
        .unwrap_or("git");
    let (valid, symptoms, treatment) = match diagnosis.name {
        "validate git exec" => (
            Command::new(executable(git))
                .arg("--version")
                .output()
                .is_ok_and(|output| output.status.success()),
            format!("git executable not found (path '{git}')"),
            "please ensure that git is installed and/or git_path is configured correctly - 'bit config set git_path <GIT_PATH>'",
        ),
        "validate npm exec" => (
            version("npm", "--version", true).is_some(),
            "npm executable not found".into(),
            "please ensure npm is installed",
        ),
        _ => (
            version("yarn", "-v", false).is_some(),
            "yarn executable not found".into(),
            "please ensure yarn is installed",
        ),
    };
    let bare = if valid {
        json!({"valid":true})
    } else if diagnosis.name == "validate git exec" {
        json!({"valid":false,"data":{"gitExecutablePath":git}})
    } else {
        json!({"valid":false,"data":{}})
    };
    diagnosis.result(bare, &symptoms, treatment)
}

#[cfg(not(windows))]
#[inline]
fn executable(command: &str) -> std::path::PathBuf {
    command
        .trim()
        .trim_matches(['"', '\''])
        .trim()
        .into()
}
#[cfg(windows)]
#[inline]
fn executable(command: &str) -> std::path::PathBuf {
    let command = command
        .trim()
        .trim_matches(['"', '\''])
        .trim();
    let command_path = std::path::Path::new(command);
    if command_path.extension().is_some() {
        return command_path.into();
    }
    let extensions = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    let path = std::env::var_os("PATH").unwrap_or_default();
    for directory in std::env::split_paths(&path) {
        for extension in extensions
            .split(';')
            .map(str::trim)
            .filter(|ext| !ext.is_empty())
        {
            let candidate = directory.join(format!("{command}{extension}"));
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    command_path.into()
}
