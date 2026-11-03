//! Replay helper ([`compare`]) verifying remote recovery keeps its published `import` + `recover` `.bitmap` transition contract via [`history_oracle`].
//!
//! Delegates comparison assertions to [`history_oracle::compare`] with the expected [`RECOVERY_RECEIPTS`] `.bitmap` history steps.

use crate::{
    commands::add::support::history_oracle,
    helper::{Helper, Run},
};

/// Expected `.bitmap` history receipt sequence (`["import", "recover"]`) produced by remote component recovery in [`compare`].
const RECOVERY_RECEIPTS: [&str; 2] = ["import", "recover"];

/// Compares `command` against `Node.js` via [`history_oracle::compare`] while asserting [`RECOVERY_RECEIPTS`] transitions and returning [`Run`].
pub(in crate::commands::recover) fn compare(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
) -> Run {
    history_oracle::compare(helper, command, stdout, RECOVERY_RECEIPTS, false)
}
