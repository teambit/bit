use super::resolve;
use crate::{
    model::{ComponentId, WorkspaceComponent},
    workspace::scope_model::ScopeObjects,
};
use serde_json::{Map, Value, json};
use std::path::PathBuf;

fn component(name: &str, env_id: &str, is_env: bool, config: &Value) -> WorkspaceComponent {
    WorkspaceComponent {
        id: ComponentId {
            scope: Some("org.scope".into()),
            default_scope: None,
            name: name.into(),
            version: None,
        },
        root_dir: name.into(),
        dir: PathBuf::from(name),
        files: Vec::new(),
        main_file: "index.ts".into(),
        package_name: format!("@org/scope.{name}"),
        env_id: env_id.into(),
        is_env,
        has_package_json: false,
        config: config
            .as_object()
            .cloned()
            .unwrap_or_else(Map::new),
    }
}

#[test]
fn the_first_configured_env_component_is_the_env() {
    let scope = tempfile::tempdir().unwrap();
    let mut components = vec![
        component("my-env", "teambit.envs/env", true, &json!({})),
        component(
            "comp",
            "teambit.harmony/node",
            false,
            &json!({
                "teambit.pkg/pkg": {},
                "org.scope/some-aspect": {},
                "org.scope/my-env": {}
            }),
        ),
    ];
    let core = vec!["teambit.pkg/pkg".to_owned()];
    resolve(&mut components, &ScopeObjects::new(scope.path()), &core).unwrap();
    assert_eq!(components[1].env_id, "org.scope/my-env");
}

#[test]
fn a_configured_env_wins() {
    let scope = tempfile::tempdir().unwrap();
    let mut components = vec![
        component("my-env", "teambit.envs/env", true, &json!({})),
        component(
            "comp",
            "teambit.harmony/node",
            false,
            &json!({
                "teambit.envs/envs": { "env": "teambit.harmony/node" },
                "org.scope/my-env": {}
            }),
        ),
    ];
    resolve(&mut components, &ScopeObjects::new(scope.path()), &[]).unwrap();
    assert_eq!(components[1].env_id, "teambit.harmony/node");
}
