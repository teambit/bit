//! External executable facts; all diagnosis policy remains native.
use super::catalog::Diagnosis;
use serde_json::{Value, json};
use std::process::Command;
pub(super) fn version(command: &str, argument: &str, clean_stderr: bool) -> Option<String> {
    let output = Command::new(executable(command))
        .arg(argument)
        .output()
        .ok()?;
    if !output.status.success() || (clean_stderr && !strip_final_newline(&output.stderr).is_empty())
    {
        return None;
    }
    let text = String::from_utf8_lossy(strip_final_newline(&output.stdout)).trim().to_owned();
    (!text.is_empty()).then_some(text)
}
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
    diagnosis.result(bare, symptoms, treatment)
}

#[cfg(not(windows))]
fn executable(command: &str) -> std::path::PathBuf {
    command.into()
}
#[cfg(windows)]
fn executable(command: &str) -> std::path::PathBuf {
    let command_path = std::path::Path::new(command);
    if command_path.extension().is_some() {
        return command_path.into();
    }
    let extensions = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    let path = std::env::var_os("PATH").unwrap_or_default();
    for directory in std::env::split_paths(&path) {
        for extension in extensions.split(';') {
            let candidate = directory.join(format!("{command}{extension}"));
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    command_path.into()
}
