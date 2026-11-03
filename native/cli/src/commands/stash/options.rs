//! Published stash grammar; `--pattern` is a boolean in Bit 2.2.94.
//!
//! Defines [`Options`] and [`parse`] ([`save`], [`load`]) for `bit stash [save|list|load]` and serializes checkout [`Value`] options.
use serde_json::{Value, json};

/// Parsed subcommand and flags (`Save`, `List`, `Load`) for `bit stash <save|list|load>`.
pub(super) enum Options {
    Save { include_new: bool, message: Option<String> },
    List,
    Load { id: Option<String>, checkout: Value },
    Unrecognized(String),
    Error(String),
}

/// Parses `bit stash` CLI tokens into [`Options`].
pub(super) fn parse(args: &[&str]) -> Option<Options> {
    let filtered: Vec<&str> = args
        .iter()
        .copied()
        .filter(|arg| {
            !matches!(
                *arg,
                "--no-color"
                    | "--no-color=true"
                    | "--no-color=false"
                    | "--color"
                    | "--color=true"
                    | "--color=false"
                    | "--color=always"
                    | "--color=never",
            )
        })
        .collect();
    let (command, rest) = filtered.split_first()?;
    match command.trim() {
        "save" | "s" => save(rest),
        "list" if matches!(rest, [] | ["--"]) => Some(Options::List),
        "load" | "pop" => load(rest),
        sub if !sub.is_empty() && !sub.starts_with('-') && matches!(rest, [] | ["--"]) => {
            Some(Options::Unrecognized(sub.to_owned()))
        }
        _ => None,
    }
}

/// Parses `bit stash save` flags (`--include-new`, `-m`/`--message`) into [`Options::Save`].
fn save(args: &[&str]) -> Option<Options> {
    let mut include_new = false;
    let mut message = None;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            return iter
                .next()
                .is_none()
                .then_some(Options::Save { include_new, message });
        }
        apply_save_arg(&mut include_new, &mut message, arg, &mut iter)?;
    }
    Some(Options::Save { include_new, message })
}

/// Applies a single `bit stash save` flag (`-i`/`--include-new` or `-m`/`--message`) for [`save`].
fn apply_save_arg<'a>(
    include_new: &mut bool,
    message: &mut Option<String>,
    arg: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
) -> Option<()> {
    if let Some(val) = arg
        .strip_prefix("--message=")
        .or_else(|| arg.strip_prefix("-m="))
    {
        let trimmed = val.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') {
            return None;
        }
        *message = Some(trimmed.to_owned());
        return Some(());
    }
    match arg {
        "-i" | "--include-new" | "--include-new=true" | "-i=true" => *include_new = true,
        "--include-new=false" | "--no-include-new" | "-i=false" => *include_new = false,
        "-m" | "--message" => {
            let value = iter
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty() && !value.starts_with('-'))?;
            *message = Some(value.to_owned());
        }
        // The published boolean reaches idsByPattern; leave its error stack to Node.
        _ => return None,
    }
    Some(())
}

/// Parses `bit stash load` (`pop`) flags and optional stash ID into [`Options`].
fn load(args: &[&str]) -> Option<Options> {
    let mut flags = LoadFlags::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            for rest in iter {
                let trimmed = rest.trim();
                (!trimmed.is_empty()
                    && !trimmed.starts_with('-')
                    && flags.id.replace(trimmed).is_none())
                .then_some(())?;
            }
            break;
        }
        flags.apply_arg(arg, &mut iter)?;
    }
    Some(flags.finish())
}

#[derive(Default)]
struct LoadFlags<'a> {
    id: Option<&'a str>,
    ours: bool,
    theirs: bool,
    manual: bool,
    strategy: Option<&'a str>,
}
#[inline]
fn parse_strategy_token(raw: &str) -> Option<&str> {
    let trimmed = raw
        .trim()
        .trim_matches(['"', '\''])
        .trim();
    (!trimmed.is_empty() && !trimmed.starts_with('-')).then_some(trimmed)
}

impl<'a> LoadFlags<'a> {
    fn apply_arg(&mut self, arg: &'a str, iter: &mut impl Iterator<Item = &'a str>) -> Option<()> {
        if self.boolean(arg) {
            return Some(());
        }
        if let Some(val) = arg
            .strip_prefix("--auto-merge-resolve=")
            .or_else(|| arg.strip_prefix("-r="))
        {
            self.strategy = Some(parse_strategy_token(val)?);
            return Some(());
        }
        match arg {
            "-r" | "--auto-merge-resolve" => {
                self.strategy = Some(iter.next().and_then(parse_strategy_token)?);
            }
            value
                if !value.starts_with('-')
                    && !value.trim().is_empty()
                    && self.id.is_none() =>
            {
                self.id = Some(value.trim());
            }
            _ => return None,
        }
        Some(())
    }

    #[inline]
    fn boolean(&mut self, arg: &str) -> bool {
        let (flag, val) = match arg {
            "--force-ours" | "--force-ours=true" => (&mut self.ours, true),
            "--force-ours=false" | "--no-force-ours" => (&mut self.ours, false),
            "--force-theirs" | "--force-theirs=true" => (&mut self.theirs, true),
            "--force-theirs=false" | "--no-force-theirs" => (&mut self.theirs, false),
            "--manual" | "--manual=true" => (&mut self.manual, true),
            "--manual=false" | "--no-manual" => (&mut self.manual, false),
            _ => return false,
        };
        *flag = val;
        true
    }

    #[inline]
    fn finish(self) -> Options {
        if self.ours && self.theirs {
            return Options::Error(
                "please use either --force-ours or --force-theirs, not both".to_owned(),
            );
        }
        if self.strategy.is_some_and(|value| !matches!(value, "ours" | "theirs" | "manual")) {
            return Options::Error(
                "--auto-merge-resolve must be one of the following: [ours, theirs, manual]"
                    .to_owned(),
            );
        }
        let mut checkout = json!({"forceOurs":self.ours,"forceTheirs":self.theirs});
        if let Some(strategy) = if self.manual { Some("manual") } else { self.strategy } {
            checkout["strategy"] = json!(strategy);
        }
        Options::Load { id: self.id.map(str::to_owned), checkout }
    }
}
