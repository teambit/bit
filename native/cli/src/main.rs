#![cfg_attr(dylint_lib = "perfectionist", feature(register_tool))]
#![cfg_attr(dylint_lib = "perfectionist", register_tool(perfectionist))]
//! The `bit` executable. Commands implemented in Rust run in this process;
//! every other command runs the Node.js Bit CLI, found by [`discovery`], with
//! the same arguments, terminal, environment and exit code. Nothing in the
//! Node.js CLI knows about this binary. See `docs/rust-cli.md`.

mod commands;
mod delegate;
mod discovery;
mod host;
mod native;
mod trace;

use std::{env, ffi::OsString, process::ExitCode};

fn main() -> ExitCode {
    pnpm_diagnostics::enable_tracing_by_env();
    let args: Vec<OsString> = env::args_os().skip(1).collect();
    match run(&args) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("bit: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(args: &[OsString]) -> std::io::Result<ExitCode> {
    if let Some(code) = native::run(args)? {
        return Ok(code);
    }
    let target = discovery::find()?;
    delegate::run(&target, args)
}
