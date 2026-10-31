//! Expected output for platform-specific CLI report tests.

/// Match the Node CLI's success symbol on this platform.
pub fn expected_success_symbols(expected: &str) -> String {
    let normalized = expected.trim_end_matches('\0').replace("\r\n", "\n");
    if cfg!(windows) { normalized.replace('\u{2714}', "\u{2713}") } else { normalized }
}
