//! Run the Node.js Bit CLI with this process's arguments, terminal and
//! environment. On Unix the process image is replaced, so the PID, the
//! controlling terminal, signals and the exit code are the Node.js CLI's own.
//! On Windows the CLI runs as a child; Ctrl-C is left to it and its exit code
//! is returned.

#[cfg(test)]
mod delegate_tests;

use crate::{
    discovery::{NodeCli, Target},
    trace,
};
use std::{
    env,
    ffi::{OsStr, OsString},
    io,
    path::Path,
    process::{Command, ExitCode},
};

pub fn run(target: &Target, args: &[OsString]) -> io::Result<ExitCode> {
    let command = command(target, args);
    if trace::enabled() {
        trace::log(format!("delegating: {}", describe(&command)));
    }
    exec(command)
}

pub fn command(target: &Target, args: &[OsString]) -> Command {
    match target {
        Target::Entry(cli) => entry_command(cli, args),
        Target::Wrapper(wrapper) => {
            let mut command = Command::new(wrapper);
            command.args(args);
            command
        }
    }
}

fn entry_command(cli: &NodeCli, args: &[OsString]) -> Command {
    let mut command = Command::new(&cli.node);
    command.arg(&cli.entry).args(args);
    // bvm's wrapper exports its Node's directory at the front of PATH for the
    // whole process tree; scripts the CLI spawns then run the same Node.
    if let Some(dir) = cli.node
        .parent()
        .filter(|_| cli.node.is_absolute() || cli.node.has_root())
    {
        command.env("PATH", path_with(dir, env::var_os("PATH")));
    }
    command
}

pub fn path_with(dir: &Path, path: Option<OsString>) -> OsString {
    let Some(path) = path.filter(|path| !path.to_string_lossy().trim().is_empty()) else {
        return dir.as_os_str().to_os_string();
    };
    if env::split_paths(&path)
        .find(|entry| !entry.as_os_str().is_empty())
        .is_some_and(|first| first == dir)
    {
        return path;
    }
    let mut joined = dir.as_os_str().to_os_string();
    joined.push(if cfg!(windows) { ";" } else { ":" });
    joined.push(path);
    joined
}

fn describe(command: &Command) -> String {
    std::iter::once(command.get_program())
        .chain(command.get_args())
        .map(OsStr::to_string_lossy)
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(unix)]
fn exec(mut command: Command) -> io::Result<ExitCode> {
    use std::os::unix::process::CommandExt;
    let error = command.exec();
    Err(io::Error::new(error.kind(), format!("{}: {error}", command.get_program().display())))
}

#[cfg(windows)]
fn exec(mut command: Command) -> io::Result<ExitCode> {
    use windows_sys::Win32::System::Console::SetConsoleCtrlHandler;
    // SAFETY: a null routine with `add = TRUE` only makes this process ignore
    // Ctrl-C; the child, which shares the console, still receives it.
    unsafe {
        SetConsoleCtrlHandler(None, 1);
    }
    let status = command
        .status()
        .map_err(|error| {
            io::Error::new(error.kind(), format!("{}: {error}", command.get_program().display()))
        })?;
    #[expect(clippy::exit, reason = "the child's full exit code must be preserved")]
    std::process::exit(status.code().unwrap_or(1));
}
