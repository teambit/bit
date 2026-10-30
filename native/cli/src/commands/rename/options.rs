use bit_object_import::component_rename::Options;

pub(super) fn parse(argv: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut positions = Vec::new();
    let mut arguments = argv.iter();
    while let Some(argument) = arguments.next() {
        match *argument {
            "--no-color" => {}
            "-s" | "--scope" => options.scope = Some((*arguments.next()?).to_owned()),
            "-p" | "--path" => options.path = Some((*arguments.next()?).to_owned()),
            "-r" | "--refactor" => options.refactor = true,
            "--preserve" => options.preserve = true,
            "--deprecate" => options.deprecate = true,
            "--delete" => {}
            "--ast" => options.ast = true,
            value if !value.starts_with('-') => positions.push(value.to_owned()),
            _ => return None,
        }
    }
    let [source, target]: [String; 2] = positions.try_into().ok()?;
    options.source = source;
    options.target = target;
    Some(options)
}
