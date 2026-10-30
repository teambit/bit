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
    for arg in args {
        apply_arg(arg, owner, &mut options, &mut names)?;
    }
    let [old, new] = names.as_slice() else { return None };
    options.old = (*old).into();
    options.new = (*new).into();
    Some(options)
}

fn apply_arg<'a>(
    arg: &'a str,
    owner: bool,
    options: &mut Options,
    names: &mut Vec<&'a str>,
) -> Option<()> {
    match arg {
        "--refactor=false"
        | "--preserve=false"
        | "--deprecate=false"
        | "--skip-dependency-installation=false" => {}
        "-r" | "--refactor" | "--refactor=true" => options.refactor = true,
        "--preserve" | "--preserve=true" if !owner => options.preserve = true,
        "--deprecate" | "--deprecate=true" if !owner => options.deprecate = true,
        "-x" | "--skip-dependency-installation" | "--skip-dependency-installation=true"
            if !owner =>
        {
            options.skip_install = true;
        }
        "-rx" | "-xr" if !owner => {
            options.refactor = true;
            options.skip_install = true;
        }
        "--ast" | "--ast=true" | "--ast=false" if owner => {} // Published report deliberately does not forward this advertised flag.
        value if !value.starts_with('-') => names.push(value),
        _ => return None,
    }
    Some(())
}
