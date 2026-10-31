//! node-ignore's replacer tables and `String.prototype.replace` with a
//! function replacement.

use regress::{Match, Regex};

/// The arguments a replacement function receives.
pub struct Found<'text> {
    pub matched: &'text str,
    pub group: Option<&'text str>,
    /// UTF-16 offset of the match, as JavaScript reports it.
    pub index: usize,
    /// UTF-16 length of the whole input.
    pub length: usize,
}

/// What a replacer function returns, given whether the pattern (`this`) has
/// a slash that is not its last character.
type Replacement = fn(&Found<'_>, bool) -> String;

pub struct Step {
    regex: Regex,
    global: bool,
    replacement: Replacement,
}

impl Step {
    fn new(source: &str, global: bool, replacement: Replacement) -> Self {
        let regex = Regex::with_flags(source, "").expect("node-ignore's replacers compile");
        Self { regex, global, replacement }
    }

    #[must_use]
    pub fn apply(&self, text: &str, anchored: bool) -> String {
        if text.is_empty() {
            return String::new();
        }
        js_replace(text, &self.regex, self.global, |found| (self.replacement)(found, anchored))
    }
}

/// `text.replace(regex, fn)`: the first match, or every match for a global
/// regex, advancing past empty matches as `lastIndex` does.
#[must_use]
pub fn js_replace(
    text: &str,
    regex: &Regex,
    global: bool,
    mut replacement: impl FnMut(&Found<'_>) -> String,
) -> String {
    let length = utf16_len(text);
    let mut output = String::with_capacity(text.len());
    let mut copied = 0;
    let mut start = 0;
    while start <= text.len() {
        let Some(found) = regex.find_from(text, start).next() else { break };
        let range = found.range();
        output.push_str(&text[copied..range.start]);
        output.push_str(&replacement(&arguments(text, &found, length)));
        copied = range.end;
        if !global {
            break;
        }
        start = if range.is_empty() { next_boundary(text, range.end) } else { range.end };
    }
    output.push_str(&text[copied..]);
    output
}

fn arguments<'text>(text: &'text str, found: &Match, length: usize) -> Found<'text> {
    let range = found.range();
    Found {
        matched: &text[range.clone()],
        group: found.group(1).map(|group| &text[group]),
        index: utf16_len(&text[..range.start]),
        length,
    }
}

fn next_boundary(text: &str, index: usize) -> usize {
    text[index..]
        .chars()
        .next()
        .map_or(index + 1, |next| index + next.len_utf8())
}

fn utf16_len(text: &str) -> usize {
    text.chars().map(char::len_utf16).sum()
}

/// `DEFAULT_REPLACER_PREFIX`.
fn prefix() -> Vec<Step> {
    vec![
        // Trailing spaces are ignored unless they are quoted with a backslash.
        Step::new(r"\\?\s+$", false, |found, _| {
            if found.matched.starts_with('\\') { " ".into() } else { String::new() }
        }),
        Step::new(r"\\\s", true, |_, _| " ".into()),
        // Escape regular expression metacharacters.
        Step::new(r"[\\\^$.|?*+()\[{]", true, |found, _| format!(r"\{}", found.matched)),
        // A leading slash matches the beginning of the pathname.
        Step::new(r"^\/", false, |_, _| "^".into()),
        Step::new(r"\/", true, |_, _| r"\/".into()),
        // A leading `**/` matches in all directories.
        Step::new(r"^\^*\\\*\\\*\\\/", false, |_, _| r"^(?:.*\/)?".into()),
    ]
}

/// `DEFAULT_REPLACER_SUFFIX`.
fn suffix() -> Vec<Step> {
    vec![
        // Starting: a pattern without an inner slash matches at any depth.
        Step::new(
            r"^(?=[^\^])",
            false,
            |_, anchored| {
                if anchored { "^".into() } else { r"(?:^|\/)".into() }
            },
        ),
        // Two globstars: zero or more directories, or everything inside.
        Step::new(r"\\\/\\\*\\\*(?=\\\/|$)", true, |found, _| {
            if found.index + 6 < found.length { r"(?:\/[^\/]+)*".into() } else { r"\/.+".into() }
        }),
        // Intermediate wildcards.
        Step::new(r"(^|[^\\]+)\\\*(?=.+)", true, |found, _| {
            format!(r"{}[^\/]*", found.group.unwrap_or_default())
        }),
        // Trailing wildcard.
        Step::new(r"(\^|\\\/)?\\\*$", false, |found, _| {
            let body = found.group
                .filter(|prefix| !prefix.is_empty())
                .map_or_else(|| "[^/]*".to_string(), |prefix| format!("{prefix}[^/]+"));
            format!(r"{body}(?=$|\/$)")
        }),
        // Unescape.
        Step::new(r"\\\\\\", true, |_, _| r"\".into()),
    ]
}

/// `POSITIVE_REPLACERS`: a plain name matches itself and what is under it.
pub fn positive() -> Vec<Step> {
    let ending = Step::new(r"(?:[^*\/])$", false, |found, _| format!(r"{}(?=$|\/)", found.matched));
    prefix()
        .into_iter()
        .chain([ending])
        .chain(suffix())
        .collect()
}

/// `NEGATIVE_REPLACERS`: a negation does not re-include a directory's content.
pub fn negative() -> Vec<Step> {
    let ending = Step::new(r"(?:[^*])$", false, |found, _| format!(r"{}(?=$|\/$)", found.matched));
    prefix()
        .into_iter()
        .chain([ending])
        .chain(suffix())
        .collect()
}
