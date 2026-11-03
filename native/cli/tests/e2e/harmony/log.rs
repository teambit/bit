//! Port of `e2e/harmony/log.e2e.ts` for the global `--log` flag ([`STATUS_LOG_CMD`], [`the_global_log_flag_logs`]).
//!
//! Verifies that running a command with `--log` emits command startup log lines ([`Helper`]).

use crate::helper::Helper;

/// Command invocation used to verify the global `--log` startup trace ([`the_global_log_flag_logs`]).
const STATUS_LOG_CMD: &str = "status --log";

/// Verifies that passing the global `--log` flag prints command startup log entries to stdout ([`STATUS_LOG_CMD`], [`Helper`]).
#[test]
fn the_global_log_flag_logs() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let output = helper.native(STATUS_LOG_CMD);
    assert!(output.contains(r#"[*] started a new command: "status""#), "{output}");
}
