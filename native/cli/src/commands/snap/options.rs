//! The native snap grammar: ordinary snaps only. Build, editor and
//! hook-altering flags stay with the Node.js CLI.
//!
//! Defines [`Options`], [`parse`], and [`canonical_flag`] and serializes snap arguments into JSON [`Value`] payloads.

use serde_json::Value;

/// Parsed CLI options for the native `bit snap [component-pattern]` command.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Options {
    pub pattern: Option<String>,
    pub message: Option<String>,
    pub unmodified: bool,
    pub unmerged: bool,
    pub skip_auto_snap: bool,
}

/// Parses `bit snap` arguments (`args` starts after the command name) into [`Options`].
#[must_use]
pub fn parse(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut seen: Vec<&str> = Vec::with_capacity(4);
    let mut index = 0;
    while index < args.len() {
        let raw = args[index];
        index += 1;
        if raw == "--" {
            options.trailing_positionals(&args[index..])?;
            break;
        }
        let flag = canonical_flag(raw);
        if matches!(
            flag,
            "--no-color"
                | "--no-color=true"
                | "--no-color=false"
                | "--color"
                | "--color=true"
                | "--color=false"
                | "--color=always"
                | "--color=never",
        ) {
            continue;
        }
        if !flag.starts_with('-') {
            options.positional(flag)?;
            continue;
        }
        let canonical = canonical_flag(flag.split_once('=').map_or(flag, |(name, _)| name));
        (!seen.contains(&canonical)).then_some(())?;
        seen.push(canonical);
        index += options.flag(flag, args.get(index).copied())?;
    }
    Some(options)
}

/// Maps short and negated `bit snap` flags to their canonical long option names.
#[inline]
fn canonical_flag(raw: &str) -> &str {
    match raw.trim() {
        "-m" => "--message",
        "-u" | "--no-unmodified" => "--unmodified",
        "--no-unmerged" => "--unmerged",
        "--no-skip-auto-snap" => "--skip-auto-snap",
        other => other,
    }
}

/// A bounded workspace pattern, including state predicates.
#[inline]
fn pattern(text: &str) -> bool {
    !text.trim().is_empty() && text.len() <= 4096 && !text.contains('\0')
}

impl Options {
    /// Consumes non-flag arguments after `--` as the positional component pattern via [`Self::positional`].
    #[inline]
    fn trailing_positionals(&mut self, trailing: &[&str]) -> Option<()> {
        for &pos in trailing {
            (!pos.starts_with('-')).then_some(())?;
            self.positional(pos)?;
        }
        Some(())
    }

    /// Records the single positional component pattern into `self.pattern` after checking [`pattern`].
    #[inline]
    fn positional(&mut self, text: &str) -> Option<()> {
        if self.pattern.is_some() || !pattern(text) {
            return None;
        }
        self.pattern = Some(text.trim().to_string());
        Some(())
    }

    /// One flag; the number of values it consumed.
    fn flag(&mut self, flag: &str, next: Option<&str>) -> Option<usize> {
        if let Some(val) = flag
            .strip_prefix("--message=")
            .or_else(|| flag.strip_prefix("-m="))
        {
            if val.starts_with('-') {
                return None;
            }
            self.message = Some(val.to_string());
            return Some(0);
        }
        match flag {
            "--message" => {
                let message = next.filter(|message| !message.starts_with('-'))?;
                self.message = Some(message.to_string());
                return Some(1);
            }
            "--unmodified" | "--unmodified=true" | "-u=true" => self.unmodified = true,
            "--unmodified=false" | "--no-unmodified" | "-u=false" => self.unmodified = false,
            "--unmerged" | "--unmerged=true" => self.unmerged = true,
            "--unmerged=false" | "--no-unmerged" => self.unmerged = false,
            "--skip-auto-snap" | "--skip-auto-snap=true" => self.skip_auto_snap = true,
            "--skip-auto-snap=false" | "--no-skip-auto-snap" => self.skip_auto_snap = false,
            _ => return None,
        }
        Some(0)
    }

    /// The engine's snap options.
    #[must_use]
    #[inline]
    pub fn request(&self) -> Value {
        let mut options = serde_json::Map::new();
        if let Some(pattern) = &self.pattern {
            options.insert("pattern".into(), Value::String(pattern.clone()));
        }
        if let Some(message) = &self.message {
            options.insert("message".into(), Value::String(message.clone()));
        }
        for (key, set) in [
            ("unmodified", self.unmodified),
            ("unmerged", self.unmerged),
            ("skipAutoSnap", self.skip_auto_snap),
        ] {
            if set {
                options.insert(key.into(), Value::Bool(true));
            }
        }
        Value::Object(options)
    }
}

#[cfg(test)]
mod options_tests;
