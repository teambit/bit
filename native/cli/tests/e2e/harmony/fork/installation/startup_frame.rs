//! A coalescible progress event may redraw before the non-coalescible store banner.
//! Remove only that clock-controlled redundant zero-add redraw when the next
//! banner frame repeats identical counters; retain every other byte and transition.
mod tests;
const START: &str = "- running package installation using pnpm\n\r\n\u{1b}[K\u{1b}[0J\r\u{1b}[1A";
const COUNTERS: &str = "Progress: resolved 1, reused 0, downloaded 0, added 0";
const TWO_COUNTERS: &str = "Progress: resolved 2, reused 0, downloaded 0, added 0";
const REDRAW: &str = "\n\u{1b}[K\u{1b}[0J\r\u{1b}[1A";
const BANNER: &str =
    "Packages are hard linked from the content-addressable store to the virtual store.\n";

pub(super) fn project(text: &str) -> String {
    let Some((prefix, rest)) = text.split_once(START) else { return text.into() };
    if text.matches(START).count() != 1 || (!prefix.is_empty() && !prefix.ends_with('\n')) {
        return text.into();
    }
    let counters = if rest.starts_with(COUNTERS) { COUNTERS } else { TWO_COUNTERS };
    let Some(banner) = rest
        .strip_prefix(counters)
        .and_then(|rest| rest.strip_prefix(REDRAW))
    else {
        return text.into();
    };
    if !repeats_counters(banner, counters) {
        return text.into();
    }
    format!("{prefix}{START}{banner}")
}
fn repeats_counters(frame: &str, counters: &str) -> bool {
    let Some(paths) = frame.strip_prefix(BANNER) else { return false };
    let Some((store, rest)) = paths.split_once('\n') else { return false };
    let Some((virtual_store, progress)) = rest.split_once('\n') else { return false };
    valid_path(store, "  Content-addressable store is at: ")
        && valid_path(virtual_store, "  Virtual store is at:             ")
        && progress
            .strip_prefix(counters)
            .is_some_and(|rest| rest.starts_with("\u{1b}[0K\n"))
}
fn valid_path(line: &str, label: &str) -> bool {
    line.strip_prefix(label)
        .and_then(|path| path.strip_suffix("\u{1b}[0K"))
        .is_some_and(|path| !path.is_empty() && !path.contains(['\r', '\n', '\u{1b}']))
}
