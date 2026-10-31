//! `ConfigCmd` reads and edits the same global, scope and workspace stores as `ConfigStoreMain`.
mod options;
mod report;
mod stores;

use crate::{
    commands::{Command, color::Chalk},
    history::History,
    native::Outcome,
};
use options::Options;
use std::{
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "config", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(options) = Options::parse(args) else {
        return Ok(Outcome::Declined("unsupported configuration arguments".to_owned()));
    };
    let mut stores = match stores::Stores::load() {
        Ok(stores) => stores,
        Err(error) => return Ok(Outcome::Declined(error.to_string())),
    };
    let chalk = Chalk::detect(args);
    let prepared = stores.prepare(&options).and_then(|()| report::render(&stores, &options, chalk));
    let text = match prepared {
        Ok(text) => text,
        Err(error) => return Ok(Outcome::Declined(error.to_string())),
    };
    let history = stores.history_scope().map(|scope| History::start_scope(scope, args));
    let result = execute(&stores, &options, chalk, &text);
    if let Some(history) = history {
        history.end(
            result
                .as_ref()
                .is_ok_and(|code| *code == ExitCode::SUCCESS),
        );
    }
    result.map(Outcome::Exit)
}

fn execute(
    stores: &stores::Stores,
    options: &Options,
    chalk: Chalk,
    text: &str,
) -> io::Result<ExitCode> {
    let output = super::workspace_command::loader_output(chalk, options.json);
    if !options.json {
        output.restart(&format!(r#"running command "{}"..."#, options.command));
    }
    let written = stores.write();
    output.stop();
    if let Err(error) = written {
        writeln!(io::stderr(), "{error}")?;
        io::stderr().flush()?;
        return Ok(ExitCode::FAILURE);
    }
    if options.json {
        write!(io::stdout(), "{text}")?;
    } else {
        writeln!(io::stdout(), "{text}")?;
    }
    io::stdout().flush()?;
    Ok(ExitCode::SUCCESS)
}
