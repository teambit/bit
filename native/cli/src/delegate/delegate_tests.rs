use super::{command, path_with};
use crate::discovery::{NodeCli, Source, Target};
use std::{
    ffi::{OsStr, OsString},
    path::{Path, PathBuf},
};

fn cli(node: &str) -> NodeCli {
    NodeCli {
        entry: PathBuf::from("/bvm/links/bit/node_modules/@teambit/bit/bin/bit"),
        node: PathBuf::from(node),
        bit_dir: None,
        bvm_link: None,
        source: Source::Env,
    }
}

fn args(command: &std::process::Command) -> Vec<OsString> {
    command
        .get_args()
        .map(OsStr::to_os_string)
        .collect()
}

#[test]
fn entry_runs_node_with_the_entry_and_all_arguments() {
    let target = Target::Entry(cli("/bvm/nodejs/22.22.0/bin/node"));
    let command = command(&target, &["status".into(), "--json".into()]);
    assert_eq!(command.get_program(), OsStr::new("/bvm/nodejs/22.22.0/bin/node"));
    assert_eq!(
        args(&command),
        ["/bvm/links/bit/node_modules/@teambit/bit/bin/bit", "status", "--json"].map(
            OsString::from
        ),
    );
    let path = command
        .get_envs()
        .find(|(key, _)| *key == OsStr::new("PATH"))
        .and_then(|(_, value)| value)
        .expect("PATH is set for an absolute node");
    assert!(path.to_string_lossy().starts_with("/bvm/nodejs/22.22.0/bin"));
}

#[test]
fn node_from_path_leaves_path_alone() {
    let command = command(&Target::Entry(cli("node")), &[]);
    assert_eq!(command.get_program(), OsStr::new("node"));
    assert!(command.get_envs().next().is_none());
}

#[test]
fn wrapper_runs_directly() {
    let command = command(&Target::Wrapper(PathBuf::from("/usr/local/bin/bit")), &["-v".into()]);
    assert_eq!(command.get_program(), OsStr::new("/usr/local/bin/bit"));
    assert_eq!(args(&command), [OsString::from("-v")]);
}

#[test]
fn path_with_prepends_once_and_keeps_empty_components() {
    let dir = Path::new("/bvm/nodejs/22.22.0/bin");
    let separator = if cfg!(windows) { ";" } else { ":" };
    assert_eq!(path_with(dir, None), dir.as_os_str());
    assert_eq!(path_with(dir, Some(OsString::new())), dir.as_os_str());
    let joined = path_with(dir, Some(OsString::from(format!("/usr/bin{separator}"))));
    assert_eq!(
        joined,
        OsString::from(format!("/bvm/nodejs/22.22.0/bin{separator}/usr/bin{separator}")),
    );
    let already = OsString::from(format!("/bvm/nodejs/22.22.0/bin{separator}/usr/bin"));
    assert_eq!(path_with(dir, Some(already.clone())), already);
}
