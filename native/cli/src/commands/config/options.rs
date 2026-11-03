//! Narrow [`Options`] grammar of the published `ConfigCmd`'s four subcommands (`get`, `set`, `del`, `list`).
//!
//! Parses subcommand arguments, `--origin`, `--detailed`, and `--json` flags.
use std::ffi::OsString;

/// Parsed CLI flags and positional values for `bit config`.
pub(super) struct Options {
    pub(super) command: String,
    pub(super) values: Vec<String>,
    pub(super) origin: Option<String>,
    pub(super) detailed: bool,
    pub(super) json: bool,
}

impl Options {
    /// Parses `args` into [`Options`] when they fit the native `bit config` grammar and pass [`is_color_flag`] filtering.
    pub(super) fn parse(args: &[OsString]) -> Option<Self> {
        let mut values = args
            .iter()
            .skip(1)
            .map(|arg| arg.to_str())
            .collect::<Option<Vec<_>>>()?;
        values.retain(|arg| !is_color_flag(arg.trim()));
        let command = if values
            .first()
            .is_some_and(|arg| {
                let trimmed = arg.trim();
                !trimmed.is_empty() && !trimmed.starts_with('-') && trimmed != "--"
            }) {
            values.remove(0).trim().to_owned()
        } else {
            "config".to_owned()
        };
        let mut options =
            Self { command, values: Vec::new(), origin: None, detailed: false, json: false };
        let mut iterator = values.into_iter();
        while let Some(arg) = iterator.next() {
            if arg == "--" {
                options.consume_trailing_values(iterator)?;
                break;
            }
            options.argument(arg, &mut iterator)?;
        }
        options.valid().then_some(options)
    }

    /// Appends positional arguments following `--` when each value is non-empty and not flag-prefixed.
    #[inline]
    fn consume_trailing_values<'a>(
        &mut self,
        iterator: impl Iterator<Item = &'a str>,
    ) -> Option<()> {
        for rest in iterator {
            let trimmed = rest.trim();
            if trimmed.is_empty() || trimmed.starts_with('-') {
                return None;
            }
            self.values.push(rest.to_owned());
        }
        Some(())
    }
}

/// Returns `true` when `arg` is a global `--color` or `--no-color` flag variant filtered out during [`Options::parse`].
#[inline]
fn is_color_flag(arg: &str) -> bool {
    matches!(
        arg,
        "--no-color"
            | "--no-colors"
            | "--no-color=true"
            | "--no-color=false"
            | "--color"
            | "--colors"
            | "--color=true"
            | "--color=false"
            | "--color=always"
            | "--color=never",
    )
}

impl Options {
    /// Consumes a single flag or positional `arg` for the active `bit config` subcommand on [`Options`].
    fn argument<'a>(
        &mut self,
        arg: &'a str,
        rest: &mut impl Iterator<Item = &'a str>,
    ) -> Option<()> {
        if !arg.starts_with('-') {
            (!arg.is_empty()).then_some(())?;
            self.values.push(arg.to_owned());
            return Some(());
        }
        match self.command.as_str() {
            "set" => self.set_flag(arg),
            "config" | "list" => match arg {
                "-j" | "-j=true" | "--json" | "--json=true" => {
                    self.json = true;
                    Some(())
                }
                "-j=false" | "--json=false" => {
                    self.json = false;
                    Some(())
                }
                "-d" | "-d=true" | "--detailed" | "--detailed=true" => {
                    self.detailed = true;
                    Some(())
                }
                "-d=false" | "--detailed=false" => {
                    self.detailed = false;
                    Some(())
                }
                "-dj" | "-jd" => {
                    self.json = true;
                    self.detailed = true;
                    Some(())
                }
                _ => self.origin_flag(arg, rest),
            },
            "del" => self.origin_flag(arg, rest),
            _ => None,
        }
    }

    #[inline]
    fn set_flag(&mut self, arg: &str) -> Option<()> {
        match arg {
            "-l" | "-l=true" | "--local" | "--local=true" | "-lt" | "-tl" => {
                self.origin = Some("scope".to_owned());
            }
            "-l=false" | "--local=false" | "-t=false" | "--local-track=false" => {}
            "-t" | "-t=true" | "--local-track" | "--local-track=true" => {
                if self.origin.as_deref() != Some("scope") {
                    self.origin = Some("workspace".to_owned());
                }
            }
            _ => return None,
        }
        Some(())
    }

    fn origin_flag<'a>(
        &mut self,
        arg: &str,
        rest: &mut impl Iterator<Item = &'a str>,
    ) -> Option<()> {
        let val = match arg {
            "-o" | "--origin" => rest.next()?,
            flag => flag
                .strip_prefix("--origin=")
                .or_else(|| flag.strip_prefix("-o="))?,
        };
        let trimmed = val.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') {
            return None;
        }
        self.origin = Some(trimmed.to_owned());
        Some(())
    }

    #[inline]
    fn valid(&self) -> bool {
        if matches!(self.command.as_str(), "get" | "set" | "del")
            && self.values
                .first()
                .is_some_and(|key| {
                    let trimmed = key.trim();
                    trimmed.is_empty()
                        || matches!(trimmed, "__proto__" | "constructor" | "prototype")
                })
        {
            return false;
        }
        match self.command.as_str() {
            "config" | "list" => self.values.is_empty(),
            "get" | "del" => self.values.len() == 1,
            "set" => self.values.len() == 2,
            _ => false,
        }
    }
}
