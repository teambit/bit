//! `e2e/harmony/log.e2e.ts`.

/// Native `status` declines the global `--log` flag ("flags outside the native `status`
/// grammar").
mod known_failures {
    use crate::{allow_known_failure, helper::Helper};

    /// logging with global --log flag › should log successfully
    #[test]
    fn the_global_log_flag_logs() {
        let helper = Helper::new();
        helper.re_init_workspace();
        let output = allow_known_failure!(helper.native_output_or_known("status --log"));
        assert!(output.contains(r#"[*] started a new command: "status""#), "{output}");
    }
}
