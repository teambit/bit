#![cfg_attr(dylint_lib = "perfectionist", feature(register_tool))]
#![cfg_attr(dylint_lib = "perfectionist", register_tool(perfectionist))]
//! The rule compiler of `ignore` 3.3.10 (node-ignore), the `.gitignore`
//! implementation Bit's workspace inventory uses. An [`Ignore`] holds the
//! rules `ignore().add(patterns)` would hold: the same regular expression
//! sources, in the same order, with the same negation flags. Matching paths
//! against them is left to the caller, which compiles each source as a
//! JavaScript regular expression with the `i` flag.
//!
//! node-ignore caches compiled regexes in a module-level object keyed by the
//! pattern alone, so a pattern compiled once as positive stays positive when
//! it is later negated. A [`Compiler`] reproduces that cache; [`Ignore::add`]
//! uses one per process, as Node does.

pub use compile::{Compiler, UnsupportedPattern};

mod compile;
#[cfg(test)]
mod tests;

use serde::Serialize;
use std::sync::{Mutex, OnceLock, PoisonError};

/// One rule of an ignore instance (`_rules[i]`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Rule {
    /// `rule.regex.source`.
    pub source: String,
    pub negative: bool,
}

/// `ignore()`: rules in the order they were added.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Ignore {
    rules: Vec<Rule>,
}

impl Ignore {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// `add(patterns)` with the process-wide regex cache.
    pub fn add<'pattern>(
        &mut self,
        patterns: impl IntoIterator<Item = &'pattern str>,
    ) -> Result<&mut Self, UnsupportedPattern> {
        let compiler = process_compiler();
        let mut compiler = compiler.lock().unwrap_or_else(PoisonError::into_inner);
        self.add_with(&mut compiler, patterns)
    }

    /// `add(patterns)` with an explicit regex cache.
    pub fn add_with<'pattern>(
        &mut self,
        compiler: &mut Compiler,
        patterns: impl IntoIterator<Item = &'pattern str>,
    ) -> Result<&mut Self, UnsupportedPattern> {
        for pattern in patterns {
            if let Some(rule) = compiler.rule(pattern)? {
                self.rules.push(rule);
            }
        }
        Ok(self)
    }

    /// `add(other)`: another instance's rules, appended.
    pub fn add_ignore(&mut self, other: &Self) -> &mut Self {
        self.rules.extend(other.rules.iter().cloned());
        self
    }

    #[must_use]
    pub fn rules(&self) -> &[Rule] {
        &self.rules
    }
}

fn process_compiler() -> &'static Mutex<Compiler> {
    static COMPILER: OnceLock<Mutex<Compiler>> = OnceLock::new();
    COMPILER.get_or_init(|| Mutex::new(Compiler::new()))
}
