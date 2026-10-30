//! Published list option selection, with unsupported grammar delegated before effects.

/// The flags `ListCmd` takes that run natively.
#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct Options {
    pub(super) ids: bool,
    pub(super) outdated: bool,
    pub(super) include_deleted: bool,
    pub(super) remote: Option<String>,
    pub(super) local_scope: bool,
    pub(super) scope: Option<String>,
    pub(super) json: bool,
    pub(super) namespace: Option<String>,
}

/// `args` starts after the command name; `None` for anything else.
pub(super) fn parse(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut seen: Vec<&str> = Vec::new();
    let mut index = 0;
    while index < args.len() {
        index += options.step(args, index, &mut seen)?;
    }
    Some(options)
}

/// The long name of a short flag.
fn long_flag(flag: &str) -> &str {
    match flag {
        "-i" => "--ids",
        "-o" => "--outdated",
        "-d" => "--include-deleted",
        "-l" => "--local-scope",
        "-s" => "--scope",
        "-j" => "--json",
        "-n" => "--namespace",
        other => other,
    }
}

impl Options {
    fn step<'a>(
        &mut self,
        args: &[&'a str],
        index: usize,
        seen: &mut Vec<&'a str>,
    ) -> Option<usize> {
        let raw = args[index];
        if raw == "--no-color" {
            return Some(1);
        }
        if !raw.starts_with('-') {
            if self.remote.is_some() || raw.is_empty() {
                return None;
            }
            self.remote = Some(raw.to_string());
            return Some(1);
        }
        let flag = long_flag(raw.split_once('=').map_or(raw, |(key, _)| key));
        if seen.contains(&flag) {
            return None;
        }
        seen.push(flag);
        Some(1 + self.flag(raw, flag, args.get(index + 1).copied())?)
    }
    /// One flag; the number of values it consumed.
    fn flag(&mut self, raw: &str, flag: &str, next: Option<&str>) -> Option<usize> {
        if let Some((_, inline)) = raw.split_once('=') {
            if !raw.starts_with("--") {
                return None;
            }
            return self.inline_flag(flag, inline);
        }
        match flag {
            "--ids" => self.ids = true,
            "--outdated" => self.outdated = true,
            "--include-deleted" => self.include_deleted = true,
            "--local-scope" => self.local_scope = true,
            "--json" => self.json = true,
            "--scope" | "--namespace" => {
                let value = next.filter(|value| !value.starts_with('-') && !value.is_empty())?;
                self.set_string(flag, value);
                return Some(1);
            }
            _ => return None,
        }
        Some(0)
    }

    fn inline_flag(&mut self, flag: &str, inline: &str) -> Option<usize> {
        if matches!(flag, "--scope" | "--namespace") {
            (!inline.is_empty() && !inline.starts_with('-')).then_some(())?;
            self.set_string(flag, inline);
            return Some(0);
        }
        let val = match inline {
            "true" => true,
            "false" => false,
            _ => return None,
        };
        match flag {
            "--ids" => self.ids = val,
            "--outdated" => self.outdated = val,
            "--include-deleted" => self.include_deleted = val,
            "--local-scope" => self.local_scope = val,
            "--json" => self.json = val,
            _ => return None,
        }
        Some(0)
    }

    fn set_string(&mut self, flag: &str, value: &str) {
        if flag == "--scope" {
            self.scope = Some(value.to_string());
        } else {
            self.namespace = Some(value.to_string());
        }
    }
}
