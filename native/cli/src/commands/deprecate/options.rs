pub(super) struct Options<'a> {
    pub pattern: &'a str,
    pub replacement: Option<&'a str>,
    pub range: Option<&'a str>,
}
pub(super) fn parse<'a>(args: &[&'a str], undo: bool) -> Option<Options<'a>> {
    let mut pattern = None;
    let mut replacement = None;
    let mut range = None;
    let mut index = 0;
    while index < args.len() {
        match args[index] {
            "--no-color" => {}
            "--new-id" if !undo => {
                index += 1;
                replacement = Some(*args.get(index)?);
            }
            "--range" if !undo => {
                index += 1;
                range = Some(*args.get(index)?);
            }
            arg if !undo && apply_inline_flag(arg, &mut replacement, &mut range) => {}
            arg if !arg.starts_with('-') && pattern.is_none() => {
                pattern = Some(arg);
            }
            _ => return None,
        }
        index += 1;
    }
    Some(Options { pattern: pattern?, replacement, range })
}

fn apply_inline_flag<'a>(
    arg: &'a str,
    replacement: &mut Option<&'a str>,
    range: &mut Option<&'a str>,
) -> bool {
    if let Some(val) = arg
        .strip_prefix("--new-id=")
        .filter(|val| !val.is_empty())
    {
        *replacement = Some(val);
        return true;
    }
    if let Some(val) = arg
        .strip_prefix("--range=")
        .filter(|val| !val.is_empty())
    {
        *range = Some(val);
        return true;
    }
    false
}
