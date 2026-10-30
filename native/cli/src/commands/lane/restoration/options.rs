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
        let revert = *args.get(1)? == "revert";
        let mut options = Self {
            id: String::new(),
            revert,
            restore_deleted: false,
            skip_install: false,
            json: false,
        };
        for value in &args[2..] {
            options.apply_arg(value)?;
        }
        (!options.id.is_empty()).then_some(options)
    }

    fn apply_arg(&mut self, value: &str) -> Option<()> {
        match value {
            "--no-color" => {}
            "-x" | "--skip-dependency-installation" | "--skip-dependency-installation=true"
                if !self.skip_install =>
            {
                self.skip_install = true;
            }
            "--skip-dependency-installation=false" => self.skip_install = false,
            "--restore-deleted-components" | "--restore-deleted-components=true"
                if self.revert && !self.restore_deleted =>
            {
                self.restore_deleted = true;
            }
            "--restore-deleted-components=false" if self.revert => self.restore_deleted = false,
            "-j" | "--json" | "--json=true" if self.revert && !self.json => self.json = true,
            "--json=false" if self.revert => self.json = false,
            id if !id.starts_with('-') && self.id.is_empty() => self.id = id.into(),
            _ => return None,
        }
        Some(())
    }

    pub fn command(&self) -> &'static str {
        if self.revert { "revert" } else { "checkout" }
    }
}
