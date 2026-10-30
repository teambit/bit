//! Published stash grammar; `--pattern` is a boolean in Bit 2.2.94.
use serde_json::{Value, json};

pub(super) enum Options {
    Save { include_new: bool, message: Option<String> },
    List,
    Load { id: Option<String>, checkout: Value },
    Unrecognized(String),
    Error(String),
}

pub(super) fn parse(args: &[&str]) -> Option<Options> {
    let filtered: Vec<&str> = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect();
    let (command, rest) = filtered.split_first()?;
    match *command {
        "save" | "s" => save(rest),
        "list" if matches!(rest, [] | ["--"]) => Some(Options::List),
        "load" | "pop" => load(rest),
        sub if !sub.starts_with('-') && rest.is_empty() => {
            Some(Options::Unrecognized(sub.to_owned()))
        }
        _ => None,
    }
}

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
        if val.is_empty() || val.starts_with('-') {
            return None;
        }
        *message = Some(val.to_owned());
        return Some(());
    }
    match arg {
        "--include-new" | "--include-new=true" => *include_new = true,
        "--include-new=false" => *include_new = false,
        "-m" | "--message" => {
            let value = iter
                .next()
                .filter(|value| !value.is_empty() && !value.starts_with('-'))?;
            *message = Some(value.to_owned());
        }
        // The published boolean reaches idsByPattern; leave its error stack to Node.
        _ => return None,
    }
    Some(())
}

fn load(args: &[&str]) -> Option<Options> {
    let mut flags = LoadFlags::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            for rest in iter {
                (!rest.is_empty() && !rest.starts_with('-') && flags.id.replace(rest).is_none())
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
impl<'a> LoadFlags<'a> {
    fn apply_arg(&mut self, arg: &'a str, iter: &mut impl Iterator<Item = &'a str>) -> Option<()> {
        if self.boolean(arg) {
            return Some(());
        }
        if let Some(val) = arg
            .strip_prefix("--auto-merge-resolve=")
            .or_else(|| arg.strip_prefix("-r="))
        {
            if val.is_empty() || val.starts_with('-') {
                return None;
            }
            self.strategy = Some(val);
            return Some(());
        }
        match arg {
            "-r" | "--auto-merge-resolve" => {
                self.strategy = Some(
                    iter.next()
                        .filter(|value| !value.is_empty() && !value.starts_with('-'))?,
                );
            }
            value if !value.starts_with('-') && self.id.is_none() => self.id = Some(value),
            _ => return None,
        }
        Some(())
    }
    fn boolean(&mut self, arg: &str) -> bool {
        let (flag, val) = match arg {
            "--force-ours" | "--force-ours=true" => (&mut self.ours, true),
            "--force-ours=false" => (&mut self.ours, false),
            "--force-theirs" | "--force-theirs=true" => (&mut self.theirs, true),
            "--force-theirs=false" => (&mut self.theirs, false),
            "--manual" | "--manual=true" => (&mut self.manual, true),
            "--manual=false" => (&mut self.manual, false),
            _ => return false,
        };
        *flag = val;
        true
    }

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
