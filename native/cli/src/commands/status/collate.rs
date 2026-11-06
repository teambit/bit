//! `a.localeCompare(b)` for component ids: ICU's root collation, restricted
//! to the characters ids and versions use. Locales whose collation tailors
//! these characters (Danish puts uppercase first, Estonian moves `z`, Turkish
//! splits `i`, Czech contracts `ch`) and any other character decline.
//!
//! [`root_locale`], [`supported`], [`compare`], and [`ROOT_LANGUAGES`] produce [`Ordering`] results matching V8 `String.prototype.localeCompare`.

#[cfg(test)]
mod collate_tests;

use std::{cmp::Ordering, env};

/// Languages whose collation equals the ICU root collation for `[A-Za-z0-9._/@+-]`.
const ROOT_LANGUAGES: &[&str] = &[
    "", "c", "posix", "en", "de", "fr", "it", "pt", "nl", "es", "ja", "zh", "ko", "ru", "uk", "pl",
];

/// Returns `true` when this process's default locale (`LC_ALL`, `LC_MESSAGES`, `LANG`) collates IDs like the ICU root locale ([`ROOT_LANGUAGES`], [`compare`], [`supported`]).
#[must_use]
pub fn root_locale() -> bool {
    let locale = ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .find_map(|name| {
            let raw = env::var_os(name)?;
            let text = raw.to_string_lossy();
            let trimmed = text
                .trim()
                .trim_matches(['"', '\''])
                .trim();
            (!trimmed.is_empty()).then(|| trimmed.to_owned())
        })
        .unwrap_or_default();
    let language = locale
        .trim_start_matches(['_', '.', '@', '-', ':'])
        .split(['_', '.', '@', '-', ':'])
        .next()
        .unwrap_or_default()
        .trim();
    ROOT_LANGUAGES
        .iter()
        .any(|root_lang| language.eq_ignore_ascii_case(root_lang))
}

/// Primary weight in root collation order: punctuation, then digits, then
/// letters regardless of case. `None` for characters this module does not handle.
#[inline]
fn primary(character: char) -> Option<u8> {
    Some(match character {
        '_' => 0,
        '-' => 1,
        '.' => 2,
        '@' => 3,
        '/' => 4,
        '+' => 5,
        '0'..='9' => 10 + (character as u8 - b'0'),
        'a'..='z' => 20 + (character as u8 - b'a'),
        'A'..='Z' => 20 + (character as u8 - b'A'),
        _ => return None,
    })
}

/// Returns `true` when every character of `text` has a known [`primary`] root collation weight for [`compare`].
#[must_use]
#[inline]
pub fn supported(text: &str) -> bool {
    text.chars()
        .all(|character| primary(character).is_some())
}

/// The root collation order of two supported strings: primary weights
/// first, then case, lowercase before uppercase.
#[must_use]
#[inline]
pub fn compare(left: &str, right: &str) -> Ordering {
    let left = left.trim();
    let right = right.trim();
    left.chars()
        .filter_map(primary)
        .cmp(right.chars().filter_map(primary))
        .then_with(|| {
            left.chars()
                .map(|character| character.is_ascii_uppercase())
                .cmp(right.chars().map(|character| character.is_ascii_uppercase()))
        })
}
