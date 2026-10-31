//! The regular expressions of npm's `semver` (`internal/re.js`), built from the
//! same sources and run by an ECMAScript regex engine so that every match,
//! capture and replacement behaves like the JavaScript original. Only the
//! strict (non-`loose`) forms are used by Bit.

use regress::{Match, Regex};
use std::sync::OnceLock;

/// The compiled expressions, indexed by [`Token`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Token {
    Full,
    Xrange,
    Tilde,
    TildeTrim,
    Caret,
    CaretTrim,
    Comparator,
    ComparatorTrim,
    HyphenRange,
    Star,
    Gte0,
    Coerce,
}

const NUMERIC: &str = r"0|[1-9]\d*";
const NUMERIC_LOOSE: &str = r"\d+";
const NON_NUMERIC: &str = r"\d*[a-zA-Z-][a-zA-Z0-9-]*";
const BUILD_IDENTIFIER: &str = "[a-zA-Z0-9-]+";
const GTLT: &str = "((?:<|>)?=?)";

fn main_version(numeric: &str) -> String {
    format!(r"({numeric})\.({numeric})\.({numeric})")
}

fn prerelease() -> String {
    let id = format!("(?:{NUMERIC}|{NON_NUMERIC})");
    format!(r"(?:-({id}(?:\.{id})*))")
}

fn prerelease_loose() -> String {
    let id = format!("(?:{NUMERIC_LOOSE}|{NON_NUMERIC})");
    format!(r"(?:-?({id}(?:\.{id})*))")
}

fn build() -> String {
    format!(r"(?:\+({BUILD_IDENTIFIER}(?:\.{BUILD_IDENTIFIER})*))")
}

fn full_plain() -> String {
    format!("v?{}{}?{}?", main_version(NUMERIC), prerelease(), build())
}

fn loose_plain() -> String {
    format!(r"[v=\s]*{}{}?{}?", main_version(NUMERIC_LOOSE), prerelease_loose(), build())
}

fn xrange_plain() -> String {
    let id = format!(r"{NUMERIC}|x|X|\*");
    format!(r"[v=\s]*({id})(?:\.({id})(?:\.({id})(?:{})?{}?)?)?", prerelease(), build())
}

fn source(token: Token) -> String {
    match token {
        Token::Full => format!("^{}$", full_plain()),
        Token::Xrange => format!(r"^{GTLT}\s*{}$", xrange_plain()),
        Token::Tilde => format!("^(?:~>?){}$", xrange_plain()),
        Token::TildeTrim => r"(\s*)(?:~>?)\s+".to_string(),
        Token::Caret => format!(r"^(?:\^){}$", xrange_plain()),
        Token::CaretTrim => r"(\s*)(?:\^)\s+".to_string(),
        Token::Comparator => format!(r"^{GTLT}\s*({})$|^$", full_plain()),
        Token::ComparatorTrim => {
            format!(r"(\s*){GTLT}\s*({}|{})", loose_plain(), xrange_plain())
        }
        Token::HyphenRange => {
            format!(r"^\s*({})\s+-\s+({})\s*$", xrange_plain(), xrange_plain())
        }
        Token::Star => r"(<|>)?=?\s*\*".to_string(),
        Token::Gte0 => r"^\s*>=\s*0\.0\.0\s*$".to_string(),
        Token::Coerce => {
            r"(^|[^\d])(\d{1,16})(?:\.(\d{1,16}))?(?:\.(\d{1,16}))?(?:$|[^\d])".to_string()
        }
    }
}

const TOKENS: [Token; 12] = [
    Token::Full,
    Token::Xrange,
    Token::Tilde,
    Token::TildeTrim,
    Token::Caret,
    Token::CaretTrim,
    Token::Comparator,
    Token::ComparatorTrim,
    Token::HyphenRange,
    Token::Star,
    Token::Gte0,
    Token::Coerce,
];

/// The compiled expression of `token`.
pub(super) fn re(token: Token) -> &'static Regex {
    static COMPILED: OnceLock<Vec<Regex>> = OnceLock::new();
    let compiled = COMPILED.get_or_init(|| {
        TOKENS
            .iter()
            .map(|token| Regex::new(&source(*token)).expect("npm semver expressions compile"))
            .collect()
    });
    &compiled[token as usize]
}

/// The capture groups of a match, `None` where JavaScript yields `undefined`.
pub(super) fn groups<'t>(found: &Match, text: &'t str) -> Vec<Option<&'t str>> {
    found
        .groups()
        .map(|group| group.map(|range| &text[range]))
        .collect()
}

/// `text.replace(re, fn)` for a non-global expression: replace the first match.
pub(super) fn replace_first(
    token: Token,
    text: &str,
    replacement: impl FnOnce(&[Option<&str>]) -> String,
) -> String {
    re(token).replace_with(text, |found| replacement(&groups(found, text)))
}

/// `text.replace(re, '$1…')` for a global expression.
pub(super) fn replace_all(token: Token, text: &str, replacement: &str) -> String {
    re(token).replace_all(text, replacement)
}

/// `text.split(/\s+/)`, keeping the empty leading and trailing parts JavaScript keeps.
pub(super) fn split_whitespace(text: &str) -> Vec<&str> {
    if text.is_empty() {
        return vec![""];
    }
    let mut parts = Vec::new();
    let mut start = 0;
    let mut in_space = false;
    for (index, ch) in text.char_indices() {
        if ch.is_whitespace() && !in_space {
            parts.push(&text[start..index]);
            in_space = true;
        } else if !ch.is_whitespace() && in_space {
            start = index;
            in_space = false;
        }
    }
    parts.push(if in_space { "" } else { &text[start..] });
    parts
}

/// `text.trim().split(/\s+/).join(' ')`.
pub(super) fn collapse_whitespace(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    split_whitespace(trimmed).join(" ")
}
