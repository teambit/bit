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
        if !options.json
            && (!args
                .iter()
                .take_while(|arg| *arg != "--")
                .any(|arg| arg == "--summary")
                || options.all
                || options.scope.is_some())
        {
            return Err(invalid("tester text reporting"));
        }
        let selected = files::select(root, &options.user_pattern)?;
        let mut settings = Self {
            selection: Selection {
                pattern: (!options.user_pattern.is_empty()).then(|| {
                    options.user_pattern.join(", ")
                }),
                changed: true,
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
        }
        Ok(settings)
    }
    fn apply(&mut self, args: &[OsString]) -> io::Result<()> {
        let mut arguments = args.iter().skip(1);
        while let Some(argument) = arguments.next() {
            match argument.to_str().ok_or_else(|| invalid("tester argument"))? {
                "--" => break,
                "--json" | "-j" | "--verbose" | "--all" | "-a" => {}
                "--scope" | "-s" => {
                    arguments.next().ok_or_else(|| invalid("tester scope"))?;
                }
                value if value.starts_with("--scope=") => {}
                "--env" | "-e" => {
                    self.environment = Some(
                        arguments
                            .next()
                            .and_then(|value| value.to_str())
                            .ok_or_else(|| invalid("tester environment"))?
                            .to_owned(),
                    );
                }
                value if value.starts_with("--env=") => {
                    self.environment = Some(value[6..].to_owned());
                }
                "--unmodified" | "-u" => self.selection.changed = false,
                "--summary" => self.summary = true,
                "--coverage" => self.coverage = true,
                "--update-snapshot" => self.update_snapshot = true,
                "--junit" => {
                    self.junit = Some(PathBuf::from(
                        arguments.next().ok_or_else(|| invalid("tester junit path"))?,
                    ));
                }
                value if value.starts_with("--junit=") => {
                    self.junit = Some(PathBuf::from(&value[8..]));
                }
                value if value.starts_with('-') => return Err(invalid("tester runtime option")),
                _ => {}
            }
        }
        Ok(())
    }
}
