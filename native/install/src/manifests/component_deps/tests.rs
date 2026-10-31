use super::{Dep, dependency_list, missing, to_deps_object, update_version};
use crate::{
    manifests::{
        deps::Field,
        tests::{component, component_dep, entry, package},
    },
    model::{ComponentDependencies, Lifecycle, MissingPackages},
};

#[test]
fn list_puts_components_first_and_is_unique_by_id() {
    let button = component("org.ui", "button", Some("1.0.0"), "teambit.harmony/node");
    let deps = ComponentDependencies {
        packages: vec![
            package("lodash", "1.0.0", Lifecycle::Runtime),
            package("lodash", "2.0.0", Lifecycle::Dev),
        ],
        components: vec![component_dep(&button, "1.0.0"), component_dep(&button, "1.0.0")],
        ..Default::default()
    };
    let list = dependency_list(&deps);
    let names: Vec<(&str, &str)> = list
        .iter()
        .map(|dep| (dep.package_name, dep.version.as_str()))
        .collect();
    assert_eq!(names, [("@org-ui/button", "1.0.0"), ("lodash", "1.0.0")]);
}

#[test]
fn manifest_object_snaps_versions() {
    let deps = ComponentDependencies {
        packages: vec![
            package("a", "abcdef0", Lifecycle::Dev),
            package("b", "^1.0.0", Lifecycle::Peer),
        ],
        ..Default::default()
    };
    let object = to_deps_object(&dependency_list(&deps));
    assert_eq!(object.get(Field::DevDependencies)["a"], "0.0.0-abcdef0");
    assert_eq!(object.get(Field::PeerDependencies)["b"], "^1.0.0");
    assert!(object.peer_meta.is_empty());
}

fn dep(version: &str, lifecycle: Lifecycle) -> Dep<'static> {
    Dep {
        package_name: "pkg",
        version: version.to_string(),
        lifecycle,
        optional: false,
        component: None,
        is_extension: false,
        hidden: false,
    }
}

#[test]
fn special_component_policy_versions_are_ignored() {
    for special in ["-", "+", "+^", "+~", "*", ""] {
        let mut dependency = dep("1.0.0", Lifecycle::Runtime);
        update_version(&mut dependency, &[entry("pkg", special, Lifecycle::Runtime)], &[]);
        assert_eq!(dependency.version, "1.0.0", "component policy {special:?}");
    }
}

#[test]
fn component_policy_matches_the_dependency_lifecycle() {
    let mut dependency = dep("1.0.0", Lifecycle::Dev);
    update_version(
        &mut dependency,
        &[entry("pkg", "2.0.0", Lifecycle::Runtime)],
        &[entry("pkg", "3.0.0", Lifecycle::Runtime)],
    );
    assert_eq!(dependency.version, "3.0.0");
    let mut peer = dep("1.0.0", Lifecycle::Peer);
    update_version(
        &mut peer,
        &[],
        &[entry("pkg", "3.0.0", Lifecycle::Runtime), entry("pkg", "4.0.0", Lifecycle::Peer)],
    );
    assert_eq!(peer.version, "4.0.0");
    let mut unversioned = dep("", Lifecycle::Runtime);
    update_version(&mut unversioned, &[], &[]);
    assert_eq!(unversioned.version, "0.0.1-new");
}

#[test]
fn dev_missing_packages_exclude_runtime_ones() {
    let deps = ComponentDependencies {
        missing_packages: MissingPackages {
            runtime: vec!["a".into(), "b".into(), "a".into()],
            dev: vec!["b".into(), "c".into(), "c".into()],
        },
        ..Default::default()
    };
    assert_eq!(missing(&deps), (vec!["a".to_string(), "b".to_string()], vec!["c".to_string()]));
}
