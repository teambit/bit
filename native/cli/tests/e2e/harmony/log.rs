//! `e2e/harmony/log.e2e.ts`.

use crate::helper::Helper;

/// logging with global --log flag › should log successfully
#[test]
fn the_global_log_flag_logs() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let output = helper.native("status --log");
    assert!(output.contains(r#"[*] started a new command: "status""#), "{output}");
}
