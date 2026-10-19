//! Recovery keeps its exact published import/recover transition contract.
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
