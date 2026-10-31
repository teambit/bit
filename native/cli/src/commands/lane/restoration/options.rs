//! Released lane checkout/revert grammar; JSON belongs only to lane revert.

pub(super) struct Options {
    pub id: String,
    pub revert: bool,
    pub restore_deleted: bool,
    pub skip_install: bool,
    pub json: bool,
}

impl Options {
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
        let mut iter = args[2..].iter().copied();
        while let Some(value) = iter.next() {
            if value == "--" {
                crate::commands::eject::consume_trailing_eject(iter, &mut options.id)?;
                break;
            }
            options.apply_arg(value)?;
        }
        (!options.id.is_empty()).then_some(options)
    }

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
            id if !id.trim().starts_with('-')
                && !id.trim().is_empty()
                && self.id.is_empty() =>
            {
                self.id = id.trim().into();
            }
            _ => return None,
        }
        Some(())
    }

    pub fn command(&self) -> &'static str {
        if self.revert { "revert" } else { "checkout" }
    }
}
