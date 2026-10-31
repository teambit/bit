//! `_checkPattern`, `_createRule` and `make_regex` of node-ignore 3.3.10.
//! Every replacement step keeps the original JavaScript regular expression
//! and is run with `regress`, so its matching is JavaScript's.

mod replace;

use crate::Rule;
use regress::Regex;
use replace::{Step, js_replace};
use std::{collections::HashMap, fmt};

/// node-ignore looks its cache up as `cache[pattern]` on a plain object, so
/// these names hit `Object.prototype` instead of a compiled regex and the
/// rule breaks the instance. Bit's Node.js CLI fails on them; callers here
/// must leave such input to it.
const PROTOTYPE_KEYS: &[&str] = &[
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
    "__proto__",
    "constructor",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "toString",
    "valueOf",
];

/// A pattern node-ignore cannot compile into a working rule.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnsupportedPattern(pub String);

impl fmt::Display for UnsupportedPattern {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "unsupported ignore pattern {:?}", self.0)
    }
}

impl std::error::Error for UnsupportedPattern {}

/// The module state of node-ignore: its replacer tables and regex cache.
pub struct Compiler {
    blank_line: Regex,
    leading_escaped_exclamation: Regex,
    leading_escaped_hash: Regex,
    has_inner_slash: Regex,
    positive: Vec<Step>,
    negative: Vec<Step>,
    /// `cache`: pattern to regex source, whichever polarity compiled it first.
    cache: HashMap<String, String>,
}

impl Default for Compiler {
    fn default() -> Self {
        Self::new()
    }
}

impl Compiler {
    #[must_use]
    pub fn new() -> Self {
        Self {
            blank_line: js(r"^\s+$"),
            leading_escaped_exclamation: js(r"^\\\!"),
            leading_escaped_hash: js(r"^\\#"),
            has_inner_slash: js(r"\/(?!$)"),
            positive: replace::positive(),
            negative: replace::negative(),
            cache: HashMap::new(),
        }
    }

    /// `_checkPattern` then `_createRule`; `None` for blank lines and comments.
    pub fn rule(&mut self, origin: &str) -> Result<Option<Rule>, UnsupportedPattern> {
        if origin.contains('\0') {
            return Err(UnsupportedPattern(origin.to_string()));
        }
        if origin.is_empty() || self.blank_line.find(origin).is_some() || origin.starts_with('#') {
            return Ok(None);
        }
        let (negative, pattern) = origin
            .strip_prefix('!')
            .map_or((false, origin), |rest| (true, rest));
        let pattern = js_replace(pattern, &self.leading_escaped_exclamation, false, |_| "!".into());
        let pattern = js_replace(&pattern, &self.leading_escaped_hash, false, |_| "#".into());
        let source = self.make_regex(&pattern, negative)?;
        Ok(Some(Rule { source, negative }))
    }

    /// `make_regex(pattern, negative)`.
    fn make_regex(&mut self, pattern: &str, negative: bool) -> Result<String, UnsupportedPattern> {
        if pattern.contains('\0') || PROTOTYPE_KEYS.contains(&pattern) {
            return Err(UnsupportedPattern(pattern.to_string()));
        }
        if let Some(source) = self.cache.get(pattern) {
            return Ok(source.clone());
        }
        let anchored = self.has_inner_slash.find(pattern).is_some();
        let steps = if negative { &self.negative } else { &self.positive };
        let source = steps
            .iter()
            .fold(pattern.to_string(), |text, step| step.apply(&text, anchored));
        self.cache.insert(pattern.to_string(), source.clone());
        Ok(source)
    }
}

fn js(source: &str) -> Regex {
    Regex::with_flags(source, "").expect("node-ignore's own regular expressions compile")
}
