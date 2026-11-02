//! Unit tests for ANSI color formatting of `add` warnings and errors via [`error`] and [`native_io`].
//!
//! Verifies [`Chalk`] styling of ignored-file warnings and [`CallbackError`] preservation.

use super::{Chalk, error, native_io};
use crate::host::callback_error::CallbackError;
use std::io;

/// Verifies that ignored-file warnings keep separate yellow segments and bold filenames inside red [`Chalk`] wrapping.
#[test]
fn ignored_files_keep_separate_yellow_sections_and_bold_names_inside_red() {
    let chalk = Chalk::new(true);
    let message = "warning: no files to add, the following files were ignored: bar/a.js, bar/b.js";
    let colored = error(io::Error::new(io::ErrorKind::InvalidInput, message), chalk);
    assert_eq!(colored.kind(), io::ErrorKind::InvalidInput);
    assert_eq!(
        chalk.red(&colored.to_string()),
        "\x1b[31m\x1b[33mwarning: no files to add\x1b[39m\x1b[31m\x1b[33m, the following files were ignored: \x1b[1mbar/a.js, bar/b.js\x1b[22m\x1b[39m\x1b[31m\x1b[39m",
    );
    assert_eq!(
        colored
            .get_ref()
            .unwrap()
            .source()
            .unwrap()
            .to_string(),
        message,
    );
}

/// Verifies that an empty-directory warning preserves yellow styling inside the outer red [`Chalk`] wrapper.
#[test]
fn empty_directory_keeps_yellow_inside_the_outer_red() {
    let chalk = Chalk::new(true);
    let colored = error(
        io::Error::new(
            io::ErrorKind::InvalidInput,
            r#"directory "/tmp/empty" is empty, no files to add"#,
        ),
        chalk,
    );
    assert_eq!(
        chalk.red(&colored.to_string()),
        "\x1b[31m\x1b[33mdirectory \"/tmp/empty\" is empty, no files to add\x1b[39m\x1b[31m\x1b[39m",
    );
}

/// Verifies that [`error`] preserves [`CallbackError`] type and both `startup` and `output` phases.
#[test]
fn callback_errors_retain_their_type_and_both_output_phases() {
    let callback = CallbackError::wrap(
        io::Error::new(io::ErrorKind::InvalidInput, "warning: no files to add"),
        "startup".to_owned(),
        "loaded".to_owned(),
    );
    let colored = error(callback, Chalk::new(true));
    assert_eq!(colored.kind(), io::ErrorKind::Other);
    let callback = colored
        .get_ref()
        .unwrap()
        .downcast_ref::<CallbackError>()
        .unwrap();
    assert_eq!(callback.startup, "startup");
    assert_eq!(callback.output, "loaded");
    assert_eq!(colored.to_string(), "warning: no files to add");
}

/// Verifies that [`native_io`] preserves the double-red ANSI styling used by released filesystem errors.
#[test]
fn native_filesystem_errors_keep_the_released_double_red_style() {
    let chalk = Chalk::new(true);
    let message = "ENOTDIR: not a directory, mkdir '/tmp/workspace/node_modules/@scope/component'";
    let colored = native_io(io::Error::other(message), chalk);
    assert_eq!(colored.kind(), io::ErrorKind::Other);
    assert_eq!(
        chalk.red(&colored.to_string()),
        "\x1b[31m\x1b[31mENOTDIR: not a directory, mkdir '/tmp/workspace/node_modules/@scope/component'\x1b[39m\x1b[31m\x1b[39m",
    );
    assert_eq!(
        colored
            .get_ref()
            .unwrap()
            .source()
            .unwrap()
            .to_string(),
        message,
    );
}

#[test]
fn callback_filesystem_messages_keep_the_callback_error_type() {
    let message = "EPERM: operation not permitted, callback fixture";
    let callback =
        CallbackError::wrap(io::Error::other(message), "startup".to_owned(), "loaded".to_owned());
    let colored = native_io(callback, Chalk::new(true));
    let callback = colored
        .get_ref()
        .unwrap()
        .downcast_ref::<CallbackError>()
        .unwrap();
    assert_eq!(callback.startup, "startup");
    assert_eq!(callback.output, "loaded");
    assert_eq!(colored.to_string(), message);
}

#[test]
fn uncolored_chalk_leaves_warning_text_without_ansi_escapes() {
    let chalk = Chalk::new(false);
    let message = "warning: no files to add, the following files were ignored: a.js";
    let colored = error(io::Error::new(io::ErrorKind::InvalidInput, message), chalk);
    assert_eq!(colored.to_string(), message);
}
