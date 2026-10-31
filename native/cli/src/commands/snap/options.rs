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
        let raw = args[index];
        index += 1;
        if raw == "--" {
            options.trailing_positionals(&args[index..])?;
            break;
        }
        let flag = canonical_flag(raw);
        if matches!(flag, "--no-color" | "--no-color=true" | "--no-color=false") {
            continue;
        }
        if !flag.starts_with('-') {
            options.positional(flag)?;
            continue;
        }
        let canonical = canonical_flag(flag.split_once('=').map_or(flag, |(name, _)| name));
        (!seen.contains(&canonical)).then_some(())?;
        seen.push(canonical);
        index += options.flag(flag, args.get(index).copied())?;
    }
    Some(options)
}

fn canonical_flag(raw: &str) -> &str {
    match raw {
        "-m" => "--message",
        "-u" => "--unmodified",
        other => other,
    }
}

/// A bounded workspace pattern, including state predicates.
fn pattern(text: &str) -> bool {
    !text.is_empty() && text.len() <= 4096 && !text.contains('\0')
}

impl Options {
    fn trailing_positionals(&mut self, trailing: &[&str]) -> Option<()> {
        for &pos in trailing {
            (!pos.starts_with('-')).then_some(())?;
            self.positional(pos)?;
        }
        Some(())
    }

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
        if let Some(val) = flag
            .strip_prefix("--message=")
            .or_else(|| flag.strip_prefix("-m="))
        {
            if val.starts_with('-') {
                return None;
            }
            self.message = Some(val.to_string());
            return Some(0);
        }
        match flag {
            "--message" => {
                let message = next.filter(|message| !message.starts_with('-'))?;
                self.message = Some(message.to_string());
                return Some(1);
            }
            "--unmodified" | "--unmodified=true" => self.unmodified = true,
            "--unmodified=false" => self.unmodified = false,
            "--unmerged" | "--unmerged=true" => self.unmerged = true,
            "--unmerged=false" => self.unmerged = false,
            "--skip-auto-snap" | "--skip-auto-snap=true" => self.skip_auto_snap = true,
            "--skip-auto-snap=false" => self.skip_auto_snap = false,
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
