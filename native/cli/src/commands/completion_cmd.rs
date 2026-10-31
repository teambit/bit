//! Native `bit completion` (`scopes/harmony/cli/completion.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{history::History, native::Outcome, workspace};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "completion", aliases: &[], run };

const BASH_COMPLETION_SCRIPT: &str = r#"###-begin-bit-completions-###
#
# yargs command completion script
#
# Installation: bit completion >> ~/.bashrc
#    or bit completion >> ~/.bash_profile on OSX.
#
_bit_yargs_completions()
{
    local cur_word args type_list

    cur_word="${COMP_WORDS[COMP_CWORD]}"
    args=("${COMP_WORDS[@]}")

    # ask yargs to generate completions.
    type_list=$(bit --get-yargs-completions "${args[@]}")

    COMPREPLY=( $(compgen -W "${type_list}" -- ${cur_word}) )

    # if no match was found, fall back to filename completion
    if [ ${#COMPREPLY[@]} -eq 0 ]; then
      COMPREPLY=()
    fi

    return 0
}
complete -o default -F _bit_yargs_completions bit
###-end-bit-completions-###
"#;

const ZSH_COMPLETION_SCRIPT: &str = r#"#compdef bit
###-begin-bit-completions-###
#
# yargs command completion script
#
# Installation: bit completion >> ~/.zshrc
#    or bit completion >> ~/.zsh_profile on OSX.
#
_bit_yargs_completions()
{
  local reply
  local si=$IFS
  IFS=$'\n' reply=($(COMP_CWORD="$((CURRENT-1))" COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" bit --get-yargs-completions "${words[@]}"))
  IFS=$si
  _describe 'values' reply
}
compdef _bit_yargs_completions bit
###-end-bit-completions-###
"#;

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("completion arguments are not UTF-8".into()));
    };
    if !valid_options(&argv[1..]) {
        return Ok(Outcome::Declined("outside native completion grammar".into()));
    }
    let history = workspace::root(&env::current_dir()?).map(|root| History::start(&root, args));
    let script = render_completion_script(is_zsh_shell());
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{script}")?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

pub(super) fn valid_options(args: &[&str]) -> bool {
    for (idx, &arg) in args.iter().enumerate() {
        let arg = arg.trim();
        if arg == "--" {
            return idx + 1 == args.len();
        }
        if !matches!(arg, "--no-color" | "--no-color=true" | "--no-color=false") {
            return false;
        }
    }
    true
}

pub(super) fn is_zsh_shell() -> bool {
    env::var("SHELL")
        .ok()
        .is_some_and(|val| val.trim().contains("zsh"))
        || env::var("ZSH_NAME")
            .ok()
            .is_some_and(|val| val.trim().contains("zsh"))
}

pub(super) const fn render_completion_script(zsh: bool) -> &'static str {
    if zsh { ZSH_COMPLETION_SCRIPT } else { BASH_COMPLETION_SCRIPT }
}
