//! `a.localeCompare(b)` for component ids: ICU's root collation, restricted
//! to the characters ids and versions use. Locales whose collation tailors
//! these characters (Danish puts uppercase first, Estonian moves `z`, Turkish
//! splits `i`, Czech contracts `ch`) and any other character decline.

#[cfg(test)]
mod collate_tests;

use std::{cmp::Ordering, env};

/// Languages whose collation equals the root collation for `[A-Za-z0-9._/@+-]`.
const ROOT_LANGUAGES: &[&str] = &[
    "", "c", "posix", "en", "de", "fr", "it", "pt", "nl", "es", "ja", "zh", "ko", "ru", "uk", "pl",
];

/// Whether this process's default locale collates ids like the root locale.
/// ICU takes it from `LC_ALL`, then `LC_MESSAGES`, then `LANG`.
pub fn root_locale() -> bool {
    let locale = ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .find_map(|name| {
            env::var(name)
                .ok()
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_default();
    let language = locale
        .split(['_', '.', '@', '-'])
        .next()
        .unwrap_or_default()
        .trim();
    ROOT_LANGUAGES.contains(&language.to_ascii_lowercase().as_str())
}

/// Primary weight in root collation order: punctuation, then digits, then
/// letters regardless of case. `None` for characters this module does not handle.
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

/// Whether every character of `text` has a known weight.
pub fn supported(text: &str) -> bool {
    text.chars()
        .all(|character| primary(character).is_some())
}

/// The root collation order of two supported strings: primary weights
/// first, then case, lowercase before uppercase.
pub fn compare(left: &str, right: &str) -> Ordering {
    let weights = |text: &str| {
        text.chars()
            .filter_map(primary)
            .collect::<Vec<_>>()
    };
    let cases = |text: &str| {
        text.chars()
            .map(|character| character.is_ascii_uppercase())
            .collect::<Vec<_>>()
    };
    weights(left)
        .cmp(&weights(right))
        .then_with(|| cases(left).cmp(&cases(right)))
}
