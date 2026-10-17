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
        let command = if values
            .first()
            .is_some_and(|arg| !arg.starts_with('-'))
        {
            values.remove(0).to_owned()
        } else {
            "config".to_owned()
        };
        let mut options =
            Self { command, values: Vec::new(), origin: None, detailed: false, json: false };
        let mut iterator = values.into_iter();
        while let Some(arg) = iterator.next() {
            options.argument(arg, &mut iterator)?;
        }
        options.valid().then_some(options)
    }

    fn argument<'a>(
        &mut self,
        arg: &'a str,
        rest: &mut impl Iterator<Item = &'a str>,
    ) -> Option<()> {
        if !arg.starts_with('-') {
            self.values.push(arg.to_owned());
            return Some(());
        }
        match self.command.as_str() {
            "set" => self.set_flag(arg),
            "list" => match arg {
                "-j" | "--json" => {
                    self.json = true;
                    Some(())
                }
                "-d" | "--detailed" => {
                    self.detailed = true;
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
            "-l" | "--local" => self.origin = Some("scope".to_owned()),
            "-t" | "--local-track" => {
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
        self.origin = Some(match arg {
            "-o" | "--origin" => rest.next()?.to_owned(),
            flag => flag.strip_prefix("--origin=")?.to_owned(),
        });
        Some(())
    }

    fn valid(&self) -> bool {
        if matches!(self.command.as_str(), "set" | "del")
            && self.values
                .first()
                .is_some_and(|key| key == "__proto__")
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
