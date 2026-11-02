//! Select supported tester modes before loader effects or external execution.
//!
//! [`Settings`] and [`Settings::parse`] validate [`Options`], [`Selection`], and [`files`] targets before running Jest.
use super::{Options, files, invalid};
use crate::commands::workspace_command::component_service::Selection;
use std::{
    ffi::OsString,
    io,
    path::{Path, PathBuf},
};

/// Validated tester flags, component [`Selection`], explicit file list, and `JUnit` output path.
pub(super) struct Settings {
    /// Component [`Selection`] criteria resolved from patterns and flags.
    pub selection: Selection,
    /// Whether `--summary` mode is active.
    pub summary: bool,
    /// Whether `--coverage` collection is enabled.
    pub coverage: bool,
    /// Whether `--update-snapshot` (`-u`) is enabled.
    pub update_snapshot: bool,
    /// Explicit test file paths resolved from CLI arguments.
    pub files: Vec<PathBuf>,
    /// Optional `--junit` XML report destination path.
    pub junit: Option<PathBuf>,
    /// Optional `--env` (`-e`) filter string.
    pub environment: Option<String>,
}
impl Settings {
    /// Parses CLI `args` and `options` into validated tester [`Settings`] for `root`.
    pub(super) fn parse(root: &Path, args: &[OsString], options: &Options) -> io::Result<Self> {
        let selected = files::select(root, &options.user_pattern)?;
        let mut settings = Self {
            selection: Selection {
                pattern: (selected.is_none() && !options.user_pattern.is_empty()).then(|| {
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
            && let Some(scope) = options.scope
                .as_deref()
                .map(str::trim)
                .filter(|scope_name| !scope_name.is_empty())
        {
            let pattern = settings.selection.pattern
                .as_deref()
                .map(str::trim)
                .filter(|pat| !pat.is_empty())
                .unwrap_or("**");
            settings.selection.pattern = Some(format!("{scope}/{pattern}"));
        }
        Ok(settings)
    }
    /// Applies tester CLI flags from `args` onto `self`.
    fn apply(&mut self, args: &[OsString]) -> io::Result<()> {
        let mut arguments = args.iter().skip(1);
        while let Some(argument) = arguments.next() {
            let token = argument
                .to_str()
                .map(str::trim)
                .ok_or_else(|| invalid("tester argument"))?;
            if token == "--" {
                break;
            }
            if self.apply_bool_flag(token) {
                continue;
            }
            match token {
                "--scope" | "-s" => {
                    non_empty_arg(&mut arguments, "tester scope")?;
                }
                "--env" | "-e" => {
                    self.environment = Some(non_empty_arg(&mut arguments, "tester environment")?);
                }
                "--junit" => {
                    self.junit =
                        Some(PathBuf::from(non_empty_arg(&mut arguments, "tester junit path")?));
                }
                value => self.apply_inline_or_short(value)?,
            }
        }
        Ok(())
    }

    /// Applies boolean color, JSON, summary, coverage, and snapshot flags for `token`, returning `true` when matched.
    #[inline]
    fn apply_bool_flag(&mut self, token: &str) -> bool {
        match token {
            "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
            | "--color=false" | "--color=always" | "--color=never" | "--json" | "--json=true"
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
        if let Some(scope_val) = value
            .strip_prefix("--scope=")
            .or_else(|| value.strip_prefix("-s="))
        {
            return validate_inline_scope(scope_val);
        }
        if let Some(env_val) = value
            .strip_prefix("--env=")
            .or_else(|| value.strip_prefix("-e="))
        {
            self.environment = Some(non_empty_inline(env_val, "tester environment")?);
            return Ok(());
        }
        if let Some(junit) = value.strip_prefix("--junit=") {
            self.junit = Some(PathBuf::from(non_empty_inline(junit, "tester junit path")?));
            return Ok(());
        }
        if let Some(flags) = value.strip_prefix('-') {
            return self.apply_short_flags(flags);
        }
        Ok(())
    }

    #[inline]
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

#[inline]
fn validate_inline_scope(scope_val: &str) -> io::Result<()> {
    let trimmed = scope_val.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return Err(invalid("tester scope"));
    }
    Ok(())
}

#[inline]
fn non_empty_inline(value: &str, label: &str) -> io::Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(invalid(label));
    }
    Ok(trimmed.to_owned())
}

#[inline]
fn non_empty_arg<'a>(
    arguments: &mut impl Iterator<Item = &'a OsString>,
    label: &str,
) -> io::Result<String> {
    arguments
        .next()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty() && !value.starts_with('-'))
        .map(str::to_owned)
        .ok_or_else(|| invalid(label))
}
