//! Narrow grammar of the published `ConfigCmd`'s four subcommands.
use std::ffi::OsString;

pub(super) struct Options {
    pub(super) command: String,
    pub(super) values: Vec<String>,
    pub(super) origin: Option<String>,
    pub(super) detailed: bool,
    pub(super) json: bool,
}

impl Options {
    pub(super) fn parse(args: &[OsString]) -> Option<Self> {
        let mut values = args
            .iter()
            .skip(1)
            .map(|arg| arg.to_str())
            .collect::<Option<Vec<_>>>()?;
        values.retain(|arg| !matches!(*arg, "--no-color" | "--no-color=true" | "--no-color=false"));
        let command = if values
            .first()
            .is_some_and(|arg| !arg.starts_with('-') && *arg != "--")
        {
            values.remove(0).to_owned()
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

    fn consume_trailing_values<'a>(
        &mut self,
        iterator: impl Iterator<Item = &'a str>,
    ) -> Option<()> {
        for rest in iterator {
            if rest.trim().is_empty() || rest.trim().starts_with('-') {
                return None;
            }
            self.values.push(rest.to_owned());
        }
        Some(())
    }

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
                "-j" | "--json" | "--json=true" => {
                    self.json = true;
                    Some(())
                }
                "--json=false" => {
                    self.json = false;
                    Some(())
                }
                "-d" | "--detailed" | "--detailed=true" => {
                    self.detailed = true;
                    Some(())
                }
                "--detailed=false" => {
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

    fn set_flag(&mut self, arg: &str) -> Option<()> {
        match arg {
            "-l" | "--local" | "--local=true" | "-lt" | "-tl" => {
                self.origin = Some("scope".to_owned());
            }
            "--local=false" | "--local-track=false" => {}
            "-t" | "--local-track" | "--local-track=true" => {
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

    fn valid(&self) -> bool {
        if matches!(self.command.as_str(), "get" | "set" | "del")
            && self.values
                .first()
                .is_some_and(|key| {
                    let trimmed = key.trim();
                    trimmed.is_empty()
                        || (matches!(self.command.as_str(), "set" | "del")
                            && matches!(trimmed, "__proto__" | "constructor" | "prototype"))
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
