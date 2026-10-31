use super::transform;
use crate::commands::{
    add::ProjectedLinker, color::Chalk, fork::options::Options, workspace_command,
};
use bit_object_import::component_fork::{self, Plan};
use serde_json::{Value, json};
use std::{io, path::Path};
pub(super) fn run(
    root: &Path,
    options: &Options,
    scope: &str,
    source: &Value,
    remote: bool,
    linker: &mut ProjectedLinker,
    chalk: Chalk,
) -> io::Result<String> {
    let (source, kernel) = prepare(options, scope, source, remote);
    let mut plan = Plan::prepare(root, &kernel, &source)?;
    if remote && options.flags.ast && !options.scope_fork {
        transform::source(root, &kernel, &source, &mut plan, linker)?;
    }
    linker.validate_captures()?;
    plan.apply_files()?;
    environment(root, options, remote, &mut plan, linker)?;
    let target = plan.target_identity().to_owned();
    linker.call(root, "forkTracked", &json!({"id":target,"progress":!options.scope_fork}))?;
    linker.link(root, plan.bitmap(), std::slice::from_ref(&target), false, chalk)?;
    print!("{}", linker.take_stdout());
    let before = linker.fork_bitmap_preimage(root)?;
    plan.commit_bitmap(&workspace_command::file_id())?;
    linker.fork_bitmap_committed(root, &before, plan.bitmap())?;
    linker.forget_loaded();
    linker.call(root,"forkAdded",&json!({"id":target,"compile":!remote||!options.multiple()||options.scope_fork,"deferred":remote&&options.multiple()&&!options.scope_fork,"progress":!options.scope_fork}))?;
    print!("{}", linker.take_stdout());
    Ok(target)
}
fn prepare(
    options: &Options,
    scope: &str,
    source: &Value,
    remote: bool,
) -> (Value, component_fork::Options) {
    let remote_multiple = remote && options.multiple();
    let mut source = source.clone();
    source["skipConfig"] = json!(options.flags.skip_config && !remote_multiple);
    source["refactorVariables"] = json!(!options.multiple());
    source["refactorIdentity"] = json!(!options.scope_fork);
    source["incrementPathIfConflicted"] = json!(options.scope_fork);
    let kernel = component_fork::Options {
        source: source["identity"]
            .as_str()
            .or_else(|| source["id"].as_str())
            .unwrap_or_default()
            .to_owned(),
        target: options.target.clone(),
        scope: Some(scope.into()),
        path: if remote_multiple { None } else { options.path.clone() },
        remote,
        preserve: options.flags.preserve && !options.multiple(),
        ast: options.flags.ast,
        no_link: options.flags.no_link && !remote_multiple,
    };
    (source, kernel)
}
fn environment(
    root: &Path,
    options: &Options,
    remote: bool,
    plan: &mut Plan,
    linker: &mut ProjectedLinker,
) -> io::Result<()> {
    if let Some(env) = &options.env
        && !(remote && options.multiple())
    {
        let config = linker.call(
            root,
            "forkEnvironment",
            &json!({"env":env,"config":plan.configuration()}),
        )?;
        plan.set_config(config)?;
    }
    Ok(())
}
