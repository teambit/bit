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
        if !args[index].starts_with('-') {
            if options.remote.is_some() || args[index].is_empty() {
                return None;
            }
            options.remote = Some(args[index].to_string());
            index += 1;
            continue;
        }
        let flag = long_flag(args[index]);
        index += 1;
        if seen.contains(&flag) {
            return None;
        }
        seen.push(flag);
        index += options.flag(flag, args.get(index).copied())?;
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
    /// One flag; the number of values it consumed.
    fn flag(&mut self, flag: &str, next: Option<&str>) -> Option<usize> {
        match flag {
            "--ids" => self.ids = true,
            "--outdated" => self.outdated = true,
            "--include-deleted" => self.include_deleted = true,
            "--local-scope" => self.local_scope = true,
            "--json" => self.json = true,
            "--scope" | "--namespace" => {
                let value = next.filter(|value| !value.starts_with('-') && !value.is_empty())?;
                let value = Some(value.to_string());
                if flag == "--scope" {
                    self.scope = value;
                } else {
                    self.namespace = value;
                }
                return Some(1);
            }
            _ => return None,
        }
        Some(0)
    }
}
