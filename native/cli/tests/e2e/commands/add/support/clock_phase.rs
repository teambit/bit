//! Align multi-write replay launch phases ([`align`]) within [`START`]..[`END`] without altering either process's clock, environment, or history.
//!
//! Ensures multi-write commands launch within the same [`SECOND`] sub-second window.

#[cfg(test)]
mod tests;
use std::{
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
/// Number of nanoseconds in one wall-clock second (`1_000_000_000`).
const SECOND: u128 = 1_000_000_000;
/// Inclusive lower bound (`50_000_000` ns) of the sub-second launch window.
const START: u128 = 50_000_000;
/// Exclusive upper bound (`100_000_000` ns) of the sub-second launch window.
const END: u128 = 100_000_000;
/// Aligns multi-write replay commands (`fork`, `scope fork`, `recover`) to the [`START`]..[`END`] sub-second window.
pub(super) fn align(command: &str) {
    if !multiple_bitmap_writes(command) {
        return;
    }
    let started = Instant::now();
    loop {
        let phase = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("fixture wall clock after epoch")
            .as_nanos()
            % SECOND;
        let delay = delay(phase);
        if delay == 0 {
            return;
        }
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "could not align mutation launch clock phase",
        );
        thread::sleep(Duration::from_nanos(u64::try_from(delay).expect("subsecond delay")));
    }
}
/// Returns `true` when `command` performs multiple `.bitmap` writes (`fork`, `scope fork`, `recover`).
fn multiple_bitmap_writes(command: &str) -> bool {
    command.starts_with("fork ")
        || command.starts_with("scope fork ")
        || command.starts_with("recover ")
}
fn delay(phase: u128) -> u128 {
    if (START..END).contains(&phase) { 0 } else { (SECOND + START - phase) % SECOND }
}
