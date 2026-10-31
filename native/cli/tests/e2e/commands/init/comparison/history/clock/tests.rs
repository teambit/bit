use super::{date, past};
use chrono::Timelike;
#[test]
fn the_same_second_is_not_past_but_the_next_second_is() {
    let latest = Some(date("2026-10-18-12-0-0"));
    assert!(!past(latest, date("2026-10-18-12-0-0")));
    assert!(!past(latest, date("2026-10-18-12-0-0").with_nanosecond(999_000_000).unwrap()));
    assert!(past(latest, date("2026-10-18-12-0-1")));
    assert!(!past(latest, date("2026-10-18-11-59-59")));
}
#[test]
fn numeric_dates_preserve_month_and_year_carry() {
    assert!(past(Some(date("2026-9-30-23-59-59")), date("2026-10-1-0-0-0")));
    assert!(past(Some(date("2026-12-31-23-59-59")), date("2027-1-1-0-0-0")));
    let latest = [date("2026-9-30-23-59-59"), date("2026-10-1-0-0-0")].into_iter().max();
    assert!(!past(latest, date("2026-10-1-0-0-0")));
}
#[test]
fn no_history_requires_no_wait() {
    assert!(past(None, date("2026-10-18-12-0-0")));
}
