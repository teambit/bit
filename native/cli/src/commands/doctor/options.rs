//! Published doctor grammar and archive flag validation.
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
        while let Some(arg) = args.get(cursor) {
            match *arg {
                "--json" | "-j" => options.json = true,
                "--list" => options.list = true,
                "--include-node-modules" | "-n" => options.include.node_modules = true,
                "--include-public" | "-p" => options.include.public = true,
                "--exclude-local-scope" | "-e" => options.include.exclude_scope = true,
                "--save" | "-s" | "--archive" | "-a" => {
                    let archive = matches!(*arg, "--archive" | "-a");
                    let path = optional_path(args, &mut cursor);
                    if archive || !options.archive {
                        options.file = Some(path);
                    }
                    options.archive |= archive;
                }
                "--remote" | "-r" => {
                    cursor += 1;
                    options.remote = Some((*args.get(cursor)?).into());
                }
                name if !name.starts_with('-') && options.name.is_none() => {
                    options.name = Some(name.into());
                }
                _ => return None,
            }
            cursor += 1;
        }
        Some(options)
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
        .filter(|arg| !arg.starts_with('-'))
    {
        *cursor += 1;
        PathBuf::from(path)
    } else {
        PathBuf::from(".")
    }
}
#[cfg(test)]
mod tests;
