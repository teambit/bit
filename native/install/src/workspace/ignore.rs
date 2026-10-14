//! node-ignore 3.3.10, the `.gitignore` matcher Bit lists component files with.
//! Patterns compile to the same JavaScript regular expressions (through the
//! ECMAScript-compatible `regress` engine), so matching agrees with Bit,
//! including where node-ignore differs from git.

use regress::{Match, Regex};
use std::{collections::HashMap, io, sync::OnceLock};

#[derive(Debug, Clone)]
struct Rule {
    regex: Regex,
    negative: bool,
}

/// An ordered rule set with node-ignore's per-path cache.
#[derive(Debug, Default, Clone)]
pub struct Ignore {
    rules: Vec<Rule>,
    cache: HashMap<String, bool>,
}

impl Ignore {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// `ignore().add(patterns)`: blank lines and `#` comments are skipped.
    pub fn add<Pattern: AsRef<str>>(
        &mut self,
        patterns: impl IntoIterator<Item = Pattern>,
    ) -> io::Result<&mut Self> {
        for pattern in patterns {
            let pattern = pattern.as_ref();
            if pattern.is_empty()
                || pattern.chars().all(char::is_whitespace)
                || pattern.starts_with('#')
            {
                continue;
            }
            self.rules.push(rule(pattern)?);
        }
        self.cache.clear();
        Ok(self)
    }

    /// `ignore().add(otherIgnore)`: append its rules.
    pub fn extend(&mut self, other: &Self) -> &mut Self {
        self.rules.extend(other.rules.iter().cloned());
        self.cache.clear();
        self
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.rules.is_empty()
    }

    /// The paths that are not ignored, in order.
    pub fn filter(&mut self, paths: &[String]) -> Vec<String> {
        paths
            .iter()
            .filter(|path| self.keep(path))
            .cloned()
            .collect()
    }

    pub fn ignores(&mut self, path: &str) -> bool {
        !self.keep(path)
    }

    /// `_filter`: a path is kept when its parent directories are kept and its
    /// own test passes. Parents are tested with a trailing slash.
    fn keep(&mut self, path: &str) -> bool {
        if path.is_empty() {
            return false;
        }
        if let Some(keep) = self.cache.get(path) {
            return *keep;
        }
        // node-ignore caches in a plain object, whose inherited properties are truthy.
        if is_object_prototype_key(path) {
            return true;
        }
        let parent = path
            .trim_end_matches('/')
            .rsplit_once('/')
            .map(|(parent, _)| format!("{parent}/"));
        let keep = parent.is_none_or(|parent| self.keep(&parent)) && self.test(path);
        self.cache.insert(path.to_owned(), keep);
        keep
    }

    fn test(&self, path: &str) -> bool {
        let mut ignored = false;
        for rule in &self.rules {
            if ignored == rule.negative {
                ignored = rule.negative ^ rule.regex.find(path).is_some();
            }
        }
        !ignored
    }
}

fn is_object_prototype_key(path: &str) -> bool {
    matches!(
        path,
        "constructor"
            | "__defineGetter__"
            | "__defineSetter__"
            | "hasOwnProperty"
            | "__lookupGetter__"
            | "__lookupSetter__"
            | "isPrototypeOf"
            | "propertyIsEnumerable"
            | "toString"
            | "valueOf"
            | "__proto__"
            | "toLocaleString",
    )
}

/// `_createRule`.
fn rule(pattern: &str) -> io::Result<Rule> {
    let (negative, body) = parts(pattern);
    Ok(Rule { regex: compile(&body, negative)?, negative })
}

/// A leading `!` negates; a leading `\!` or `\#` is a literal `!` or `#`.
fn parts(pattern: &str) -> (bool, String) {
    let (negative, body) = pattern
        .strip_prefix('!')
        .map_or((false, pattern), |body| (true, body));
    let body = if let Some(rest) = body.strip_prefix(r"\!") {
        format!("!{rest}")
    } else if let Some(rest) = body.strip_prefix(r"\#") {
        format!("#{rest}")
    } else {
        body.to_owned()
    };
    (negative, body)
}

type Replace = fn(&Match, &str, &str) -> String;

struct Replacer {
    regex: Regex,
    global: bool,
    replace: Replace,
}

fn replacer(source: &str, global: bool, replace: Replace) -> Replacer {
    Replacer { regex: Regex::new(source).expect("node-ignore replacer regex"), global, replace }
}

fn group(found: &Match, text: &str, index: usize) -> Option<String> {
    found
        .group(index)
        .map(|range| text[range].to_owned())
}

fn prefix() -> Vec<Replacer> {
    vec![
        // Trailing spaces are ignored unless escaped with a backslash.
        replacer(r"\\?\s+$", false, |found, text, _| {
            if found.as_str(text).starts_with('\\') { " ".to_owned() } else { String::new() }
        }),
        replacer(r"\\\s", true, |_, _, _| " ".to_owned()),
        // Escape regular expression metacharacters.
        replacer(r"[\\\^$.|?*+()\[{]", true, |found, text, _| format!(r"\{}", found.as_str(text))),
        replacer(r"^\/", false, |_, _, _| "^".to_owned()),
        replacer(r"\/", true, |_, _, _| r"\/".to_owned()),
        // A leading `**/` matches in all directories.
        replacer(r"^\^*\\\*\\\*\\\/", false, |_, _, _| r"^(?:.*\/)?".to_owned()),
    ]
}

fn suffix() -> Vec<Replacer> {
    vec![
        replacer(r"^(?=[^\^])", false, |_, _, pattern| {
            let has_inner_slash = Regex::new(r"\/(?!$)")
                .expect("slash regex")
                .find(pattern)
                .is_some();
            if has_inner_slash { "^".to_owned() } else { r"(?:^|\/)".to_owned() }
        }),
        replacer(r"\\\/\\\*\\\*(?=\\\/|$)", true, |found, text, _| {
            if found.end() < text.len() { r"(?:\/[^\/]+)*".to_owned() } else { r"\/.+".to_owned() }
        }),
        replacer(r"(^|[^\\]+)\\\*(?=.+)", true, |found, text, _| {
            format!(r"{}[^\/]*", group(found, text, 1).unwrap_or_default())
        }),
        replacer(r"(\^|\\\/)?\\\*$", false, |found, text, _| {
            let head = group(found, text, 1).filter(|head| !head.is_empty());
            let body = head.map_or_else(|| "[^/]*".to_owned(), |head| format!("{head}[^/]+"));
            format!(r"{body}(?=$|\/$)")
        }),
        replacer(r"\\\\\\", true, |_, _, _| r"\".to_owned()),
    ]
}

fn replacers(negative: bool) -> &'static [Replacer] {
    static POSITIVE: OnceLock<Vec<Replacer>> = OnceLock::new();
    static NEGATIVE: OnceLock<Vec<Replacer>> = OnceLock::new();
    let (cell, ending) =
        if negative { (&NEGATIVE, r"(?:[^*])$") } else { (&POSITIVE, r"(?:[^*\/])$") };
    cell.get_or_init(|| {
        let mut list = prefix();
        // A pattern without a trailing wildcard matches the path or a directory of it;
        // a negative one does not re-include the directory's contents.
        let replace: Replace = if negative {
            |found, text, _| format!(r"{}(?=$|\/$)", found.as_str(text))
        } else {
            |found, text, _| format!(r"{}(?=$|\/)", found.as_str(text))
        };
        list.push(replacer(ending, false, replace));
        list.extend(suffix());
        list
    })
}

/// node-ignore's regular expression for a pattern: [`source`], case-insensitive.
fn compile(pattern: &str, negative: bool) -> io::Result<Regex> {
    Regex::with_flags(&source(pattern, negative), "i")
        .map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!(r#"invalid ignore pattern "{pattern}": {error}"#),
            )
        })
}

/// The JavaScript regular expression source node-ignore builds for a pattern.
fn source(pattern: &str, negative: bool) -> String {
    let mut source = pattern.to_owned();
    for replacer in replacers(negative) {
        let text = source.clone();
        let replace = |found: &Match| (replacer.replace)(found, &text, pattern);
        source = if replacer.global {
            replacer.regex.replace_all_with(&text, replace)
        } else {
            replacer.regex.replace_with(&text, replace)
        };
    }
    source
}

#[cfg(test)]
mod tests;
