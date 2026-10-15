//! Bit's loader is one per process, as in Node: every `Output` drives the same spinner
//! and the same `logger.off()`/`logger.on()` switch. The cases share that state, so they
//! run in order in one test, in this binary's own process.

use bit_install::output::{Output, Sink};
use std::{
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

const FRAME: Duration = Duration::from_millis(80);

fn recorder() -> (Sink, Arc<Mutex<String>>) {
    let written = Arc::new(Mutex::new(String::new()));
    let target = Arc::clone(&written);
    (Arc::new(move |text: &str| target.lock().unwrap().push_str(text)), written)
}

fn take(written: &Mutex<String>) -> String {
    std::mem::take(&mut *written.lock().unwrap())
}

#[test]
fn one_loader_serves_every_output() {
    let (sink, written) = recorder();
    let command = Output::new(true, true, true, Arc::clone(&sink));
    let install = Output::new(true, true, true, sink);
    restarts_leave_one_spinner(&command, &written);
    a_new_status_replaces_the_other_outputs_spinner(&command, &install, &written);
    off_silences_every_output_until_on(&command, &install, &written);
    console_lines_wait_for_the_loader(&command, &written);
}

/// Restarting faster than a frame used to leave one more frame thread each time.
fn restarts_leave_one_spinner(command: &Output, written: &Mutex<String>) {
    for _ in 0..10 {
        command.status("importing components");
    }
    thread::sleep(FRAME * 5);
    command.stop();
    let frames = take(written).matches("importing components").count();
    assert!((1..=7).contains(&frames), "{frames} frames in 5 frame intervals");
    thread::sleep(FRAME * 3);
    assert_eq!(take(written), "", "a frame after stop");
}

fn a_new_status_replaces_the_other_outputs_spinner(
    command: &Output,
    install: &Output,
    written: &Mutex<String>,
) {
    command.status("import 1 components with their dependencies (if missing)");
    thread::sleep(FRAME * 2);
    install.status("linking components");
    take(written);
    thread::sleep(FRAME * 3);
    let after = take(written);
    assert!(after.contains("\u{1b}[36m"), "ora's cyan frame: {after:?}");
    assert!(after.contains("linking components"), "{after:?}");
    assert!(!after.contains("import 1 components"), "the replaced spinner drew: {after:?}");
}

fn off_silences_every_output_until_on(command: &Output, install: &Output, written: &Mutex<String>) {
    install.loader_off();
    take(written);
    thread::sleep(FRAME * 3);
    command.failure("installation failed with the following error: no");
    command.success("importing components", None);
    assert_eq!(take(written), "", "printed while the loader is off");
    install.loader_on();
    command.success("importing components", None);
    assert_eq!(take(written), "\u{1b}[32m✔\u{1b}[39m importing components\n");
}

fn console_lines_wait_for_the_loader(command: &Output, written: &Mutex<String>) {
    command.loader_off();
    take(written);
    let output = Output::new(false, false, false, command.sink()).with_console(false);
    output.console("dropped");
    output.success("dropped", None);
    assert_eq!(take(written), "");
    output.loader_on();
    output.console("plain");
    output.success("done", None);
    assert_eq!(take(written), "  plain\n✔ done\n");
}
