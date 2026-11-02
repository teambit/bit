//! Released lane checkout/revert grammar; JSON belongs only to lane revert.
//!
//! Defines [`Options`] (`parse`) for `bit lane checkout` and `bit lane revert` invocations.

/// Parsed CLI options for `bit lane checkout` and `bit lane revert`.
pub(super) struct Options {
    pub id: String,
    pub revert: bool,
    pub restore_deleted: bool,
    pub skip_install: bool,
    pub json: bool,
}

impl Options {
    /// Parses `args` into [`Options`] when they fit the native `bit lane checkout` or `bit lane revert` grammar.
    #[must_use]
    #[inline]
    pub fn parse(args: &[&str]) -> Option<Self> {
        let sub = args.get(1)?.trim();
        if !matches!(sub, "checkout" | "revert") {
            return None;
        }
        let revert = sub == "revert";
        let mut options = Self {
            id: String::new(),
            revert,
            restore_deleted: false,
            skip_install: false,
            json: false,
        };
        let mut iter = args
            .get(2..)
            .unwrap_or_default()
            .iter()
            .copied();
        while let Some(value) = iter.next() {
            let trimmed = value.trim();
            if trimmed == "--" {
                crate::commands::eject::consume_trailing_eject(iter, &mut options.id)?;
                break;
            }
            options.apply_arg(trimmed)?;
        }
        (!options.id.is_empty() && options.id.len() <= 256).then_some(options)
    }

    /// Applies a single flag or positional history ID token onto [`Options`].
    #[inline]
    fn apply_arg(&mut self, value: &str) -> Option<()> {
        match value {
            "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
            | "--color=false" | "--color=always" | "--color=never" => {}
            "-x" | "--skip-dependency-installation" | "--skip-dependency-installation=true" => {
                self.skip_install = true;
            }
            "--skip-dependency-installation=false" => self.skip_install = false,
            "--restore-deleted-components" | "--restore-deleted-components=true" if self.revert => {
                self.restore_deleted = true;
            }
            "--restore-deleted-components=false" if self.revert => self.restore_deleted = false,
            "-j" | "--json" | "--json=true" if self.revert => self.json = true,
            "--json=false" if self.revert => self.json = false,
            "-xj" | "-jx" if self.revert => {
                self.skip_install = true;
                self.json = true;
            }
            id if !id.starts_with('-')
                && !id.is_empty()
                && id.len() <= 256
                && self.id.is_empty() =>
            {
                self.id = id.into();
            }
            _ => return None,
        }
        Some(())
    }

    /// Returns the subcommand name (`"revert"` or `"checkout"`) for lifecycle reporting.
    #[must_use]
    #[inline]
    pub const fn command(&self) -> &'static str {
        if self.revert { "revert" } else { "checkout" }
    }
}
