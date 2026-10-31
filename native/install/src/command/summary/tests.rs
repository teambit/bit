use super::{format, seconds};
use crate::output::Output;
use std::{sync::Arc, time::Duration};

fn output() -> Output {
    Output::new(false, false, true, Arc::new(|_: &str| {}))
}

#[test]
fn prints_seconds_like_javascript() {
    assert_eq!(seconds(Duration::from_millis(437_197)), "437.197");
    assert_eq!(seconds(Duration::from_millis(1_500)), "1.5");
    assert_eq!(seconds(Duration::from_secs(2)), "2");
    assert_eq!(seconds(Duration::from_millis(40)), "0.04");
}

#[test]
fn formats_the_summary() {
    let text = format(&output(), 3, Duration::from_millis(1_250), false, &[]);
    assert_eq!(
        text,
        "\nSuccessfully installed dependencies and compiled 3 component(s) in 1.25 seconds",
    );
}

#[test]
fn asks_for_another_install_when_legacy_envs_did_not_load() {
    let text = format(&output(), 1, Duration::from_secs(1), false, &["org.scope/env".into()]);
    assert!(text.starts_with("\nBit was not able to install all dependencies. Please run \"bit install\" again (or use the \"--recurring-install\" option next time).\nThe following environments"));
    assert!(text.contains("fix the warning: org.scope/env\nRead more"));
    let recurring = format(&output(), 1, Duration::from_secs(1), true, &["org.scope/env".into()]);
    assert!(recurring.contains("again \nThe following"));
}
