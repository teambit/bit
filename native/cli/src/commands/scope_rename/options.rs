use bit_object_import::component_scope_rename::Options;
pub(super) fn parse(args: &[&str]) -> Option<Options> {
    let (kind, args) = args.split_first()?;
    let owner = match *kind {
        "rename" => false,
        "rename-owner" => true,
        _ => return None,
    };
    let mut options = Options { owner, ..Default::default() };
    let mut names = Vec::new();
    for arg in args {
        match *arg {
            "--no-color" => {}
            "-r" | "--refactor" => options.refactor = true,
            "--preserve" if !owner => options.preserve = true,
            "--deprecate" if !owner => options.deprecate = true,
            "-x" | "--skip-dependency-installation" if !owner => options.skip_install = true,
            "--ast" if owner => {} // Published report deliberately does not forward this advertised flag.
            value if !value.starts_with('-') => names.push(value),
            _ => return None,
        }
    }
    let [old, new] = names.as_slice() else { return None };
    options.old = (*old).into();
    options.new = (*new).into();
    Some(options)
}
