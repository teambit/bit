//! One optional wall-clock sampled redraw before pnpm's first package banner.

const MARKER: &str = "- running package installation using pnpm\n\r\n\u{1b}[K\u{1b}[0J\r\u{1b}[1A";
const FRAME: &str =
    "Progress: resolved 1, reused 0, downloaded 0, added 0\n\u{1b}[K\u{1b}[0J\r\u{1b}[1A";
const BANNER: &str =
    "Packages are hard linked from the content-addressable store to the virtual store.\n";

/// pnpm may sample its initial zero-add state before immediately redrawing the banner.
/// Keep all other progress, control sequences and package/lifecycle output byte-exact.
pub(crate) fn project(text: &str) -> String {
    let Some((before, progress)) = text.split_once(MARKER) else {
        return text.to_owned();
    };
    let Some(banner) = progress
        .strip_prefix(FRAME)
        .filter(|rest| rest.starts_with(BANNER))
    else {
        return text.to_owned();
    };
    format!("{before}{MARKER}{banner}")
}
