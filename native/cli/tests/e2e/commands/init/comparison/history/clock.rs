//! Age real setup backup IDs before replay; init creates one backup per history store.
mod tests;
use super::{Histories, validate_id};
use chrono::{Local, NaiveDate, NaiveDateTime, Timelike};
use std::time::{Duration, Instant};

pub(super) fn wait(histories: &Histories) {
    let latest = histories.0
        .values()
        .flat_map(|history| history.ids.keys())
        .map(|id| date(id))
        .max();
    if latest.is_none() {
        return;
    }
    let started = Instant::now();
    while !past(latest, Local::now().naive_local()) {
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "setup backup IDs remain in the future",
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}
fn date(id: &str) -> NaiveDateTime {
    validate_id(id);
    let fields = id
        .split('-')
        .map(|field| field.parse::<u32>().unwrap())
        .collect::<Vec<_>>();
    NaiveDate::from_ymd_opt(i32::try_from(fields[0]).unwrap(), fields[1], fields[2])
        .and_then(|day| day.and_hms_opt(fields[3], fields[4], fields[5]))
        .expect("invalid setup backup date")
}
fn past(latest: Option<NaiveDateTime>, now: NaiveDateTime) -> bool {
    latest.is_none_or(|latest| now.with_nanosecond(0).unwrap() > latest)
}
