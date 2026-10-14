//! The native snap grammar: ordinary snaps only. Build, editor and
//! hook-altering flags stay with the Node.js CLI.

use serde_json::{Value, json};

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Options {
    pub pattern: Option<String>,
    pub message: Option<String>,
    pub unmodified: bool,
    pub unmerged: bool,
    pub skip_auto_snap: bool,
}

/// `args` starts after the command name.
pub fn parse(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut seen: Vec<&str> = Vec::new();
    let mut index = 0;
    while index < args.len() {
        let flag = match args[index] {
            "-m" => "--message",
            "-u" => "--unmodified",
            other => other,
        };
        index += 1;
        if !flag.starts_with('-') {
            options.positional(flag)?;
        } else if seen.contains(&flag) {
            return None;
        } else {
            seen.push(flag);
            index += options.flag(flag, args.get(index).copied())?;
        }
    }
    Some(options)
}

/// A pattern without state selectors (`$…`) or `AND`.
fn pattern(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 4096
        && !text.contains('\0')
        && !text
            .split(',')
            .any(|part| part.trim().starts_with('$') || part.contains(" AND "))
}

impl Options {
    /// The one pattern.
    fn positional(&mut self, text: &str) -> Option<()> {
        if self.pattern.is_some() || !pattern(text) {
            return None;
        }
        self.pattern = Some(text.to_string());
        Some(())
    }

    /// One flag; the number of values it consumed.
    fn flag(&mut self, flag: &str, next: Option<&str>) -> Option<usize> {
        match flag {
            "--message" => {
                let message = next.filter(|message| !message.starts_with('-'))?;
                self.message = Some(message.to_string());
                return Some(1);
            }
            "--unmodified" => self.unmodified = true,
            "--unmerged" => self.unmerged = true,
            "--skip-auto-snap" => self.skip_auto_snap = true,
            _ => return None,
        }
        Some(0)
    }

    /// The engine's snap options.
    pub fn request(&self) -> Value {
        let mut options = json!({});
        if let Some(pattern) = &self.pattern {
            options["pattern"] = json!(pattern);
        }
        if let Some(message) = &self.message {
            options["message"] = json!(message);
        }
        for (key, set) in [
            ("unmodified", self.unmodified),
            ("unmerged", self.unmerged),
            ("skipAutoSnap", self.skip_auto_snap),
        ] {
            if set {
                options[key] = json!(true);
            }
        }
        options
    }
}

#[cfg(test)]
mod options_tests;
