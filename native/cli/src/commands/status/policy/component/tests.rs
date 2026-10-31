use super::Policy;
use serde_json::{Value, json};

fn policy(config: &Value) -> Policy {
    Policy::read(
        &json!({}),
        &json!({"identity":"scope/name"}),
        &[json!({"name":"teambit.dependencies/dependency-resolver","config":{"policy":config}})],
    )
    .unwrap()
}

#[test]
fn forced_component_policy_overrides_environment_and_keeps_removals() {
    let policy = policy(&json!({
        "dependencies":{"react":"1.2.3","same":"1"},
        "devDependencies":{"@types/node":"-","same":"2"},
        "peerDependencies":{"same":"3","react-dom":{"version":"4","resolveFromEnv":true}}
    }));
    assert_eq!(
        policy.manual,
        [
            json!({"react":"1.2.3"})
                .as_object()
                .unwrap()
                .clone(),
            json!({"@types/node":"-","@types/jest":"26.0.20"})
                .as_object()
                .unwrap()
                .clone(),
            json!({"react-dom":"4","same":"3"})
                .as_object()
                .unwrap()
                .clone(),
        ],
    );
}

#[test]
fn array_entries_keep_first_duplicate_and_force_controls_detection() {
    let policy = policy(&json!({"dependencies":[
        {"name":"automatic","version":"1"},
        {"name":"automatic","version":"2","force":true},
        {"name":"forced","version":{"version":"3","resolveFromEnv":true},"force":true}
    ]}));
    assert_eq!(
        policy.automatic[0],
        json!({"automatic":"1"})
            .as_object()
            .unwrap()
            .clone(),
    );
    assert_eq!(
        policy.manual[0],
        json!({"forced":"3"})
            .as_object()
            .unwrap()
            .clone(),
    );
}

#[test]
fn environment_and_registered_policy_precedence_match_variant_policy() {
    let context = json!({"environmentFacts":{"scope/name":{
        "envPolicy":{"dependencies":{"legacy":"1"},"runtime":[{"name":"legacy","version":"2"}],
            "dev":[{"name":"tool","version":"3","force":true}],
            "peers":[{"name":"peer","version":"4","supportedRange":"^4"}]},
        "registeredEnvPolicy":[{"dependencies":{"legacy":"5"}}]
    }}});
    let policy = Policy::read(&context, &json!({"identity":"scope/name"}), &[]).unwrap();
    assert_eq!(
        policy.manual[0],
        json!({"legacy":"5"})
            .as_object()
            .unwrap()
            .clone(),
    );
    assert_eq!(
        policy.manual[1],
        json!({"tool":"3"})
            .as_object()
            .unwrap()
            .clone(),
    );
    assert_eq!(
        policy.automatic[2],
        json!({"peer":"^4"})
            .as_object()
            .unwrap()
            .clone(),
    );
    assert!(!policy.automatic[0].contains_key("legacy"));
}
