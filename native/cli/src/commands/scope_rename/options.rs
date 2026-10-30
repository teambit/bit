use bit_object_import::component_scope_rename::Options;
pub(super) fn parse(args: &[&str]) -> Option<Options> {
    let filtered: Vec<&str> = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
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
        (!rest.is_empty() && !rest.starts_with('-')).then_some(())?;
        names.push(rest);
    }
    Some(())
}

fn apply_arg<'a>(
    arg: &'a str,
    owner: bool,
    options: &mut Options,
    names: &mut Vec<&'a str>,
) -> Option<()> {
    if !arg.starts_with('-') && !arg.is_empty() {
        names.push(arg);
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
        "--preserve" | "--preserve=true" => options.preserve = true,
        "--preserve=false" => options.preserve = false,
        "--deprecate" | "--deprecate=true" => options.deprecate = true,
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
