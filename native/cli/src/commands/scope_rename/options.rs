use bit_object_import::component_scope_rename::Options;
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
    let (kind, args) = filtered.split_first()?;
    let owner = match *kind {
        "rename" => false,
        "rename-owner" => true,
        _ => return None,
    };
    let mut options = Options { owner, ..Default::default() };
    let mut names = Vec::new();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            consume_trailing_names(iter, &mut names)?;
            break;
        }
        apply_arg(arg, owner, &mut options, &mut names)?;
    }
    let [old, new] = names.as_slice() else { return None };
    options.old = (*old).into();
    options.new = (*new).into();
    Some(options)
}

fn consume_trailing_names<'a>(
    iter: impl Iterator<Item = &'a str>,
    names: &mut Vec<&'a str>,
) -> Option<()> {
    for rest in iter {
        let trimmed = rest.trim();
        (!trimmed.is_empty() && !trimmed.starts_with('-')).then_some(())?;
        names.push(trimmed);
    }
    Some(())
}

fn apply_arg<'a>(
    arg: &'a str,
    owner: bool,
    options: &mut Options,
    names: &mut Vec<&'a str>,
) -> Option<()> {
    let trimmed = arg.trim();
    if !trimmed.starts_with('-') && !trimmed.is_empty() {
        names.push(trimmed);
        return Some(());
    }
    match arg {
        "-r" | "--refactor" | "--refactor=true" => options.refactor = true,
        "--refactor=false" => options.refactor = false,
        "--ast" | "--ast=true" | "--ast=false" if owner => {} // Published report deliberately does not forward this advertised flag.
        other if !owner => apply_scope_rename_flag(other, options)?,
        _ => return None,
    }
    Some(())
}

fn apply_scope_rename_flag(arg: &str, options: &mut Options) -> Option<()> {
    match arg {
        "-p" | "--preserve" | "--preserve=true" => options.preserve = true,
        "--preserve=false" => options.preserve = false,
        "-d" | "--deprecate" | "--deprecate=true" => options.deprecate = true,
        "--deprecate=false" => options.deprecate = false,
        "-x" | "--skip-dependency-installation" | "--skip-dependency-installation=true" => {
            options.skip_install = true;
        }
        "--skip-dependency-installation=false" => options.skip_install = false,
        "-rx" | "-xr" => {
            options.refactor = true;
            options.skip_install = true;
        }
        _ => return None,
    }
    Some(())
}
