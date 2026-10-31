//! Published doctor grammar and archive flag validation.
#[cfg(test)]
mod tests;

use std::path::PathBuf;

#[derive(Debug, Default)]
pub(super) struct Options {
    pub name: Option<String>,
    pub json: bool,
    pub list: bool,
    pub file: Option<PathBuf>,
    pub archive: bool,
    pub include: Includes,
    pub remote: Option<String>,
}
#[derive(Debug, Default)]
pub(super) struct Includes {
    pub node_modules: bool,
    pub public: bool,
    pub exclude_scope: bool,
}
impl Options {
    pub fn parse(args: &[&str]) -> Option<Self> {
        let mut options = Self::default();
        let mut cursor = 0;
        while let Some(&arg) = args.get(cursor) {
            if arg == "--" {
                options.consume_trailing_name(&args[cursor + 1..])?;
                break;
            }
            if !options.apply_arg(args, &mut cursor, arg) {
                return None;
            }
            cursor += 1;
        }
        Some(options)
    }

    fn consume_trailing_name(&mut self, rest: &[&str]) -> Option<()> {
        for &arg in rest {
            let trimmed = arg.trim();
            if trimmed.is_empty() || trimmed.starts_with('-') || self.name.is_some() {
                return None;
            }
            self.name = Some(trimmed.into());
        }
        Some(())
    }

    fn apply_arg(&mut self, args: &[&str], cursor: &mut usize, arg: &str) -> bool {
        if self.apply_boolean(arg) || self.apply_inline_valued(arg) {
            return true;
        }
        self.apply_valued_or_name(args, cursor, arg)
    }

    fn apply_inline_valued(&mut self, arg: &str) -> bool {
        if let Some(val) = arg
            .strip_prefix("--remote=")
            .or_else(|| arg.strip_prefix("-r="))
            .map(str::trim)
        {
            if val.is_empty() || val.starts_with('-') {
                return false;
            }
            self.remote = Some(val.into());
            return true;
        }
        let Some(val) = arg
            .strip_prefix("--save=")
            .or_else(|| arg.strip_prefix("-s="))
            .or_else(|| arg.strip_prefix("--archive="))
            .or_else(|| arg.strip_prefix("-a="))
            .map(str::trim)
        else {
            return false;
        };
        if val.is_empty() || val.starts_with('-') {
            return false;
        }
        let archive = arg.starts_with("--archive=") || arg.starts_with("-a=");
        if archive || !self.archive {
            self.file = Some(PathBuf::from(val));
        }
        self.archive |= archive;
        true
    }

    fn apply_boolean(&mut self, arg: &str) -> bool {
        match arg {
            "--no-color" | "--no-color=true" | "--no-color=false" => {}
            "--json" | "-j" | "--json=true" => self.json = true,
            "--json=false" => self.json = false,
            "--list" | "--list=true" => self.list = true,
            "--list=false" => self.list = false,
            "--include-node-modules" | "-n" | "--include-node-modules=true" => {
                self.include.node_modules = true;
            }
            "--include-node-modules=false" => self.include.node_modules = false,
            "--include-public" | "-p" | "--include-public=true" => self.include.public = true,
            "--include-public=false" => self.include.public = false,
            "--exclude-local-scope" | "-e" | "--exclude-local-scope=true" => {
                self.include.exclude_scope = true;
            }
            "--exclude-local-scope=false" => self.include.exclude_scope = false,
            _ => return self.apply_combined_short(arg),
        }
        true
    }

    fn apply_combined_short(&mut self, arg: &str) -> bool {
        let Some(flags) = arg.strip_prefix('-') else {
            return false;
        };
        if flags.len() < 2
            || flags.starts_with('-')
            || !flags
                .chars()
                .all(|ch| matches!(ch, 'j' | 'n' | 'p' | 'e'))
        {
            return false;
        }
        for ch in flags.chars() {
            match ch {
                'j' => self.json = true,
                'n' => self.include.node_modules = true,
                'p' => self.include.public = true,
                _ => self.include.exclude_scope = true,
            }
        }
        true
    }

    fn apply_valued_or_name(&mut self, args: &[&str], cursor: &mut usize, arg: &str) -> bool {
        match arg {
            "--save" | "-s" | "--archive" | "-a" => {
                let archive = matches!(arg, "--archive" | "-a");
                let path = optional_path(args, cursor);
                if archive || !self.archive {
                    self.file = Some(path);
                }
                self.archive |= archive;
                true
            }
            "--remote" | "-r" => {
                *cursor += 1;
                let Some(val) = args
                    .get(*cursor)
                    .copied()
                    .filter(|val| !val.is_empty() && !val.starts_with('-'))
                else {
                    return false;
                };
                self.remote = Some(val.into());
                true
            }
            name if !name.starts_with('-') && !name.is_empty() && self.name.is_none() => {
                self.name = Some(name.into());
                true
            }
            _ => false,
        }
    }
    pub fn validate(&self) -> Result<(), String> {
        if self.list {
            return Ok(());
        }
        if (self.include.node_modules || self.include.exclude_scope) && !self.archive {
            return Err(
                "to use --include-node-modules or --exclude-local-scope please specify --archive"
                    .into(),
            );
        }
        let invalid = self.remote_flags();
        if self.remote.is_some() && !invalid.is_empty() {
            return Err(format!(
                "The following flags cannot be used with --remote: {}. Archive-related options are only applicable when running doctor locally.",
                invalid.join(", "),
            ));
        }
        Ok(())
    }
    fn remote_flags(&self) -> Vec<&str> {
        [
            (self.archive, "--archive"),
            (self.include.node_modules, "--include-node-modules"),
            (self.include.public, "--include-public"),
            (self.include.exclude_scope, "--exclude-local-scope"),
        ]
        .into_iter()
        .filter_map(|(enabled, flag)| enabled.then_some(flag))
        .collect()
    }
}
fn optional_path(args: &[&str], cursor: &mut usize) -> PathBuf {
    if let Some(path) = args
        .get(*cursor + 1)
        .map(|arg| arg.trim())
        .filter(|arg| !arg.is_empty() && !arg.starts_with('-'))
    {
        *cursor += 1;
        PathBuf::from(path)
    } else {
        PathBuf::from(".")
    }
}
