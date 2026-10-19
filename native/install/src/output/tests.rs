use super::{Output, Sink, Style, pretty_time};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

static STATUS_TEST: Mutex<()> = Mutex::new(());

fn recorder() -> (Sink, Arc<Mutex<String>>) {
    let written = Arc::new(Mutex::new(String::new()));
    let target = Arc::clone(&written);
    (Arc::new(move |text: &str| target.lock().unwrap().push_str(text)), written)
}

#[test]
fn pretty_time_uses_the_largest_whole_unit() {
    assert_eq!(pretty_time(Duration::from_millis(5)), "5ms");
    assert_eq!(pretty_time(Duration::from_nanos(523_456_789)), "523ms");
    assert_eq!(pretty_time(Duration::from_millis(1_234)), "1s");
    assert_eq!(pretty_time(Duration::from_millis(75_500)), "1m");
    assert_eq!(pretty_time(Duration::from_secs(3_700)), "1h");
}

#[test]
fn paints_only_with_colors() {
    let (sink, _) = recorder();
    assert_eq!(Output::new(false, false, true, Arc::clone(&sink)).paint(Style::Cyan, "x"), "x");
    assert_eq!(
        Output::new(true, false, true, sink).paint(Style::Cyan, "x"),
        "\u{1b}[36mx\u{1b}[39m",
    );
}

#[test]
fn writes_like_ora_without_a_tty() {
    let _status = STATUS_TEST.lock().unwrap();
    let (sink, written) = recorder();
    let output = Output::new(false, false, true, sink);
    output.status("importing missing objects");
    output.console("plain");
    output.success("done", None);
    output.warning("careful");
    output.failure("broken");
    assert_eq!(
        *written.lock().unwrap(),
        "- importing missing objects\n  plain\n✔ done\n⚠ careful\n✖ broken\n",
    );
}

#[test]
fn without_a_loader_only_console_messages_print() {
    let _status = STATUS_TEST.lock().unwrap();
    let (sink, written) = recorder();
    let output = Output::new(false, false, false, sink);
    output.status("importing missing objects");
    output.console("plain");
    output.success("done", None);
    assert_eq!(*written.lock().unwrap(), "plain\n");
}

#[test]
fn status_lines_are_not_shown_on_ci() {
    let _status = STATUS_TEST.lock().unwrap();
    let (sink, written) = recorder();
    let output = Output::new(false, false, true, sink).with_ci(true);
    output.status("loading 1 component(s)");
    output.success("done", None);
    assert_eq!(*written.lock().unwrap(), "✔ done\n");
}

#[test]
fn ci_completion_reuses_status_without_explicit_completions_replacing_it() {
    let _status = STATUS_TEST.lock().unwrap();
    let (sink, written) = recorder();
    let output = Output::new(false, false, true, sink).with_ci(true);
    output.restart("successfully imported 1 components");
    output.status("deduping dependencies for installation");
    output.success_status();
    output.success("linking components", None);
    output.success_status();
    assert_eq!(
        *written.lock().unwrap(),
        "- successfully imported 1 components\n✔ successfully imported 1 components\n✔ linking components\n✔ successfully imported 1 components\n",
    );
}

#[test]
fn multiline_warning_colors_reopen_after_lf_and_crlf() {
    let (sink, _) = recorder();
    let output = Output::new(true, false, true, sink);
    assert_eq!(
        output.paint(Style::Yellow, "one\r\n\ntwo"),
        "\u{1b}[33mone\u{1b}[39m\r\n\u{1b}[33m\u{1b}[39m\n\u{1b}[33mtwo\u{1b}[39m",
    );
    assert_eq!(output.paint(Style::Yellow, ""), "");
}
