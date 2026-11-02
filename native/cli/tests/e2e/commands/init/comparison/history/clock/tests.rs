//! Unit tests for history backup timestamp comparison ([`date`], [`past`]) in `bit init` replay suites.
//!
//! Verifies same-second rejection, next-second advancement, and month/year rollover carry.

use super::{date, past};
use chrono::Timelike;
/// Verifies [`past`] rejects the same second and accepts the next second via [`date`].
#[test]
fn the_same_second_is_not_past_but_the_next_second_is() {
    let latest = Some(date("2026-10-18-12-0-0"));
    assert!(!past(latest, date("2026-10-18-12-0-0")));
    assert!(!past(latest, date("2026-10-18-12-0-0").with_nanosecond(999_000_000).unwrap()));
    assert!(past(latest, date("2026-10-18-12-0-1")));
    assert!(!past(latest, date("2026-10-18-11-59-59")));
}
/// Verifies [`date`] and [`past`] handle month-end and year-end rollovers accurately.
#[test]
fn numeric_dates_preserve_month_and_year_carry() {
    assert!(past(Some(date("2026-9-30-23-59-59")), date("2026-10-1-0-0-0")));
    assert!(past(Some(date("2026-12-31-23-59-59")), date("2027-1-1-0-0-0")));
    let latest = [date("2026-9-30-23-59-59"), date("2026-10-1-0-0-0")].into_iter().max();
    assert!(!past(latest, date("2026-10-1-0-0-0")));
}
/// Verifies that [`past`] returns `true` when `latest` is `None` or two seconds earlier than `now`.
#[test]
fn no_history_requires_no_wait() {
    assert!(past(None, date("2026-10-18-12-0-0")));
    assert!(past(Some(date("2026-10-18-12-0-0")), date("2026-10-18-12-0-2")));
}
