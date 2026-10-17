//! Published stash grammar; `--pattern` is a boolean in Bit 2.2.94.
use serde_json::{Value, json};

pub(super) enum Options {
    Save { include_new: bool, message: Option<String> },
    List,
    Load { id: Option<String>, checkout: Value },
    Error(String),
}

pub(super) fn parse(args: &[&str]) -> Option<Options> {
    let (command, args) = args.split_first()?;
    match *command {
        "save" | "s" => save(args),
        "list" if args.is_empty() => Some(Options::List),
        "load" | "pop" => load(args),
        _ => None,
    }
}

fn save(args: &[&str]) -> Option<Options> {
    let mut include_new = false;
    let mut message = None;
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        match *arg {
            "--include-new" if !include_new => include_new = true,
            "-m" | "--message" if message.is_none() => {
                let value = args
                    .next()
                    .filter(|value| !value.is_empty() && !value.starts_with('-'))?;
                message = Some((*value).to_owned());
            }
            // The published boolean reaches idsByPattern; leave its error stack to Node.
            _ => return None,
        }
    }
    Some(Options::Save { include_new, message })
}

fn load(args: &[&str]) -> Option<Options> {
    let mut flags = LoadFlags::default();
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        if flags.boolean(arg) {
            continue;
        }
        match *arg {
            "-r" | "--auto-merge-resolve" if flags.strategy.is_none() => {
                flags.strategy = Some(
                    *args
                        .next()
                        .filter(|value| !value.starts_with('-'))?,
                );
            }
            value if !value.starts_with('-') && flags.id.is_none() => flags.id = Some(value),
            _ => return None,
        }
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
impl LoadFlags<'_> {
    fn boolean(&mut self, arg: &str) -> bool {
        let flag = match arg {
            "--force-ours" => &mut self.ours,
            "--force-theirs" => &mut self.theirs,
            "--manual" => &mut self.manual,
            _ => return false,
        };
        if *flag {
            return false;
        }
        *flag = true;
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
