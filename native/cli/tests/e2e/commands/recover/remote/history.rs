//! Replay helper ([`compare`]) verifying remote recovery keeps its published `import` + `recover` `.bitmap` transition contract via [`history_oracle`].
//!
//! Delegates comparison assertions to [`history_oracle::compare`] with the expected `.bitmap` history steps.

use crate::{
    commands::add::support::history_oracle,
    helper::{Helper, Run},
};

pub(in crate::commands::recover) fn compare(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
) -> Run {
    history_oracle::compare(helper, command, stdout, ["import", "recover"], false)
}
