//! Select supported tester modes before loader effects or external execution.
use super::{Options, files, invalid};
use crate::commands::workspace_command::component_service::Selection;
use std::{
    ffi::OsString,
    io,
    path::{Path, PathBuf},
};

pub(super) struct Settings {
    pub selection: Selection,
    pub summary: bool,
    pub coverage: bool,
    pub update_snapshot: bool,
    pub files: Vec<PathBuf>,
    pub junit: Option<PathBuf>,
    pub environment: Option<String>,
}
impl Settings {
    pub(super) fn parse(root: &Path, args: &[OsString], options: &Options) -> io::Result<Self> {
        let selected = files::select(root, &options.user_pattern)?;
        let mut settings = Self {
            selection: Selection {
                pattern: (!options.user_pattern.is_empty()).then(|| {
                    options.user_pattern.join(", ")
                }),
                changed: options.json || !options.all,
                ..Selection::default()
            },
            summary: false,
            coverage: false,
            update_snapshot: false,
            files: Vec::new(),
            junit: None,
            environment: None,
        };
        settings.apply(args)?;
        if let Some(selected) = selected {
            settings.selection.pattern = Some(selected.identities.join(", "));
            if selected.identities.len() > 1 {
                settings.selection.exact = Some(selected.identities);
                settings.selection.explicit_file_order = true;
            }
            settings.files = selected.paths;
        } else if !options.json
            && let Some(scope) = &options.scope
        {
            let pattern = settings.selection.pattern.as_deref().unwrap_or("**");
            settings.selection.pattern = Some(format!("{scope}/{pattern}"));
        }
        Ok(settings)
    }
    fn apply(&mut self, args: &[OsString]) -> io::Result<()> {
        let mut arguments = args.iter().skip(1);
        while let Some(argument) = arguments.next() {
            let token = argument.to_str().ok_or_else(|| invalid("tester argument"))?;
            if token == "--" {
                break;
            }
            if self.apply_bool_flag(token) {
                continue;
            }
            match token {
                "--scope" | "-s" => {
                    arguments.next().ok_or_else(|| invalid("tester scope"))?;
                }
                "--env" | "-e" => {
                    self.environment = Some(
                        arguments
                            .next()
                            .and_then(|value| value.to_str())
                            .ok_or_else(|| invalid("tester environment"))?
                            .to_owned(),
                    );
                }
                "--junit" => {
                    self.junit = Some(PathBuf::from(
                        arguments.next().ok_or_else(|| invalid("tester junit path"))?,
                    ));
                }
                value => self.apply_inline_or_short(value)?,
            }
        }
        Ok(())
    }

    fn apply_bool_flag(&mut self, token: &str) -> bool {
        match token {
            "--no-color" | "--no-color=true" | "--no-color=false" | "--json" | "--json=true"
            | "--json=false" | "-j" | "--verbose" | "--verbose=true" | "--verbose=false"
            | "--all" | "--all=true" | "--all=false" | "-a" | "--watch=false" | "--debug=false" => {
            }
            "--unmodified" | "--unmodified=true" | "-u" => self.selection.changed = false,
            "--unmodified=false" => self.selection.changed = true,
            "--summary" | "--summary=true" => self.summary = true,
            "--summary=false" => self.summary = false,
            "--coverage" | "--coverage=true" => self.coverage = true,
            "--coverage=false" => self.coverage = false,
            "--update-snapshot" | "--update-snapshot=true" => self.update_snapshot = true,
            "--update-snapshot=false" => self.update_snapshot = false,
            _ => return false,
        }
        true
    }

    fn apply_inline_or_short(&mut self, value: &str) -> io::Result<()> {
        if value.starts_with("--scope=") || value.starts_with("-s=") {
            return Ok(());
        }
        if let Some(env_val) = value
            .strip_prefix("--env=")
            .or_else(|| value.strip_prefix("-e="))
        {
            self.environment = Some(env_val.to_owned());
            return Ok(());
        }
        if let Some(junit) = value.strip_prefix("--junit=") {
            self.junit = Some(PathBuf::from(junit));
            return Ok(());
        }
        if let Some(flags) = value.strip_prefix('-') {
            return self.apply_short_flags(flags);
        }
        Ok(())
    }

    fn apply_short_flags(&mut self, flags: &str) -> io::Result<()> {
        if flags.len() < 2
            || flags.starts_with('-')
            || !flags
                .chars()
                .all(|ch| matches!(ch, 'u' | 'a' | 'j'))
        {
            return Err(invalid("tester runtime option"));
        }
        if flags.contains('u') {
            self.selection.changed = false;
        }
        Ok(())
    }
}
