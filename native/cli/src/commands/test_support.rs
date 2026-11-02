//! Expected output for platform-specific CLI report tests.
//!
//! [`expected_success_symbols`] normalizes `\r\n` line endings and Windows checkmarks in test expectations.

/// Normalizes CRLF line endings and converts heavy checkmarks to Windows checkmarks when `cfg!(windows)`.
#[must_use]
#[inline]
pub fn expected_success_symbols(expected: &str) -> String {
    let trimmed = expected.trim_end_matches('\0');
    let normalized =
        if trimmed.contains("\r\n") { trimmed.replace("\r\n", "\n") } else { trimmed.to_owned() };
    if cfg!(windows) && normalized.contains('\u{2714}') {
        normalized.replace('\u{2714}', "\u{2713}")
    } else {
        normalized
    }
}
