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
            match *value {
                "-x" | "--skip-dependency-installation" if !options.skip_install => {
                    options.skip_install = true;
                }
                "--restore-deleted-components" if revert && !options.restore_deleted => {
                    options.restore_deleted = true;
                }
                "-j" | "--json" if revert && !options.json => options.json = true,
                id if !id.starts_with('-') && options.id.is_empty() => options.id = id.into(),
                _ => return None,
            }
        }
        (!options.id.is_empty()).then_some(options)
    }

    pub fn command(&self) -> &'static str {
        if self.revert { "revert" } else { "checkout" }
    }
}
