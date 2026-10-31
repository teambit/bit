//! Option parsing for `bit log`.

#[derive(Default)]
pub(super) struct Options<'a> {
    pub(super) id: Option<&'a str>,
    pub(super) json: bool,
    pub(super) parents: bool,
    pub(super) one_line: bool,
    pub(super) full_hash: bool,
    pub(super) full_message: bool,
    pub(super) show_hidden: bool,
    pub(super) remote: bool,
}

pub(super) fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            consume_trailing_id(iter, &mut options.id)?;
            break;
        }
        apply_log_arg(&mut options, arg)?;
    }
    options.id.map(|_| options)
}

fn consume_trailing_id<'a>(
    iter: impl Iterator<Item = &'a str>,
    id: &mut Option<&'a str>,
) -> Option<()> {
    for rest in iter {
        if rest.is_empty() || rest.starts_with('-') || id.is_some() {
            return None;
        }
        *id = Some(rest);
    }
    Some(())
}

fn apply_log_arg<'a>(options: &mut Options<'a>, arg: &'a str) -> Option<()> {
    if matches!(arg, "--no-color" | "--no-color=true" | "--no-color=false")
        || apply_log_combined_short(options, arg)
    {
        return Some(());
    }
    if !arg.starts_with('-') && !arg.is_empty() && options.id.is_none() {
        options.id = Some(arg);
        return Some(());
    }
    let (flag, val) = match arg.split_once('=') {
        Some((flag, "true")) if flag.starts_with("--") => (flag, true),
        Some((flag, "false")) if flag.starts_with("--") => (flag, false),
        None => (arg, true),
        _ => return None,
    };
    let field = match flag {
        "-j" | "--json" => &mut options.json,
        "--parents" => &mut options.parents,
        "-o" | "--one-line" => &mut options.one_line,
        "-f" | "--full-hash" => &mut options.full_hash,
        "-m" | "--full-message" => &mut options.full_message,
        "--show-hidden" => &mut options.show_hidden,
        "-r" | "--remote" => &mut options.remote,
        _ => return None,
    };
    *field = val;
    Some(())
}

fn apply_log_combined_short(options: &mut Options<'_>, arg: &str) -> bool {
    if !arg.starts_with('-')
        || arg.starts_with("--")
        || arg.len() <= 2
        || !arg[1..]
            .bytes()
            .all(|byte| matches!(byte, b'j' | b'o' | b'f' | b'm' | b'r'))
    {
        return false;
    }
    for byte in arg[1..].bytes() {
        *log_short_field(options, byte) = true;
    }
    true
}

fn log_short_field<'a>(options: &'a mut Options<'_>, byte: u8) -> &'a mut bool {
    match byte {
        b'j' => &mut options.json,
        b'o' => &mut options.one_line,
        b'f' => &mut options.full_hash,
        b'm' => &mut options.full_message,
        _ => &mut options.remote,
    }
}
