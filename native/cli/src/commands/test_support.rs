//! Expected output for platform-specific CLI report tests.

/// Match the Node CLI's success symbol on this platform.
pub fn expected_success_symbols(expected: &str) -> String {
    if cfg!(windows) { expected.replace('\u{2714}', "\u{2713}") } else { expected.to_owned() }
}
