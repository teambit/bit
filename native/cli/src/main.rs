#![cfg_attr(dylint_lib = "perfectionist", feature(register_tool))]
#![cfg_attr(dylint_lib = "perfectionist", register_tool(perfectionist))]
//! The `bit` executable. Commands implemented in Rust run in this process;
//! every other command runs the Node.js Bit CLI, found by [`discovery`], with
//! the same arguments, terminal, environment and exit code. Nothing in the
//! Node.js CLI knows about this binary. See `docs/rust-cli.md`.

mod commands;
mod delegate;
mod discovery;
mod history;
mod host;
mod native;
mod trace;
mod workspace;

use std::{env, ffi::OsString, process::ExitCode};

fn main() -> ExitCode {
    // pnpm's cached umask read briefly changes the process-wide mask. Initialize
    // it before workers can create directories with an unmasked mode.
    #[cfg(unix)]
    let _ = pnpm_fs::file_mode::current_umask();
    pnpm_diagnostics::enable_tracing_by_env();
    let args = collect_cli_args();
    match run(&args) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("bit: {}", error.to_string().trim());
            ExitCode::FAILURE
        }
    }
}

fn collect_cli_args() -> Vec<OsString> {
    env::args_os().skip(1).collect()
}

fn run(args: &[OsString]) -> std::io::Result<ExitCode> {
    if let Some(code) = native::run(args)? {
        return Ok(code);
    }
    let target = discovery::find()?;
    delegate::run(&target, args)
}
