//! A deliberately narrow grammar for switching to local lane state. Remote
//! fetches, merge strategies and partial switches stay with the Node CLI.

use serde_json::{Value, json};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Options {
    pub lane: String,
    pub verbose: bool,
    pub force_ours: bool,
    pub force_theirs: bool,
}

pub fn parse(args: &[&str]) -> Option<Options> {
    let mut parsed = Parsed::default();
    for arg in args {
        parsed.accept(arg)?;
    }
    parsed.finish()
}

#[derive(Default)]
struct Parsed {
    lane: Option<String>,
    skip_fetch: bool,
    skip_install: bool,
    verbose: bool,
    force_ours: bool,
    force_theirs: bool,
}

impl Parsed {
    fn accept(&mut self, arg: &str) -> Option<()> {
        if arg.starts_with('-') {
            return self.flag(arg);
        }
        if self.lane.is_some() || !valid_lane(arg) {
            return None;
        }
        self.lane = Some(arg.to_string());
        Some(())
    }

    fn flag(&mut self, arg: &str) -> Option<()> {
        let slot = match arg {
            "--skip-fetch" => &mut self.skip_fetch,
            "-x" | "--skip-dependency-installation" => &mut self.skip_install,
            "--verbose" => &mut self.verbose,
            "--force-ours" if !self.force_theirs => &mut self.force_ours,
            "--force-theirs" if !self.force_ours => &mut self.force_theirs,
            _ => return None,
        };
        if *slot {
            return None;
        }
        *slot = true;
        Some(())
    }

    fn finish(self) -> Option<Options> {
        if !self.skip_fetch || !self.skip_install {
            return None;
        }
        Some(Options {
            lane: self.lane?,
            verbose: self.verbose,
            force_ours: self.force_ours,
            force_theirs: self.force_theirs,
        })
    }
}

fn valid_lane(lane: &str) -> bool {
    !lane.is_empty()
        && !lane.starts_with('-')
        && lane.len() <= 256
        && !lane.contains("..")
        && lane
            .split('/')
            .all(|part| !part.is_empty() && part.bytes().all(lane_char))
        && lane.split('/').count() <= 2
}

fn lane_char(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.')
}

impl Options {
    pub fn request(&self) -> Value {
        json!({
            "lane": {"name": self.lane, "skipFetch": true},
            "skipDependencyInstallation": true,
            "verbose": self.verbose,
            "forceOurs": self.force_ours,
            "forceTheirs": self.force_theirs,
        })
    }
}

#[cfg(test)]
mod options_tests;
