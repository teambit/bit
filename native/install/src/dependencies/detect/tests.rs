use super::{Resolver, Subject, Workspace, detect};
use crate::{
    dependencies::{DependencyOptions, component_model::ComponentModel},
    host::CoreAspect,
    policy::tests::component,
};
use indexmap::IndexMap;
use std::{fs, path::Path};

#[test]
fn core_aspects_follow_tree_order_and_repeat_for_each_origin() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path();
    let mut component = component(root, "acme/env/provider@1.0.0", "teambit.harmony/node");
    component.files = vec!["index.js".into(), "dist/index.js".into()];
    for file in &component.files {
        let path = component.dir.join(file);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "require('@teambit/workspace'); require('@teambit/envs'); require('@teambit/envs/extra');").unwrap();
    }
    let aspects = vec![aspect(root, "workspace"), aspect(root, "envs")];
    let components = vec![component];
    let detected = detect_provider(root, &components, &aspects);
    assert_eq!(
        detected.core_aspects,
        [
            "teambit.example/envs",
            "teambit.example/workspace",
            "teambit.example/envs",
            "teambit.example/workspace"
        ],
    );
}

fn aspect(root: &Path, name: &str) -> CoreAspect {
    let directory = root.join("node_modules/@teambit").join(name);
    fs::create_dir_all(&directory).unwrap();
    fs::write(
        directory.join("package.json"),
        serde_json::json!({"name":format!("@teambit/{name}"),"version":"1.0.0","componentId":{"scope":"teambit.example","name":name,"version":"1.0.0"}}).to_string(),
    ).unwrap();
    CoreAspect {
        id: format!("teambit.example/{name}"),
        package_name: format!("@teambit/{name}"),
        dir: directory,
    }
}

fn detect_provider(
    root: &Path,
    components: &[crate::model::WorkspaceComponent],
    aspects: &[CoreAspect],
) -> crate::dependencies::data::Detected {
    let options = DependencyOptions::default();
    let workspace = Workspace {
        components,
        manifest: Default::default(),
        root_package_json: None,
        options: &options,
    };
    let subject = Subject {
        component: &components[0],
        model: ComponentModel::new(None),
        dev_files: Vec::new(),
        own_env: None,
        custom: IndexMap::new(),
    };
    let mut resolver = Resolver::new(root, components, aspects);
    detect(&workspace, &subject, &mut resolver).unwrap()
}
