use super::subscriber_links;
use crate::model::{InstallPlan, Project};
use serde_json::json;

#[test]
fn replacing_links_uses_unlinked_manifests_without_overwriting_declared_dependencies() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let original = vec![Project {
        dir: root.to_path_buf(),
        manifest: json!({"dependencies":{"declared":"^1.0.0"}})
            .as_object()
            .unwrap()
            .clone(),
    }];
    let mut plan = InstallPlan {
        projects: vec![Project {
            dir: root.to_path_buf(),
            manifest: json!({"dependencies":{"obsolete":"link:old","declared":"^1.0.0"}})
                .as_object()
                .unwrap()
                .clone(),
        }],
        ..Default::default()
    };
    let mut options = json!({"linkedDependencies":{}});
    options["linkedDependencies"][root.to_str().unwrap()] =
        json!({"replacement":"link:new","declared":"link:must-not-win"});
    subscriber_links(root, &mut plan, &original, &options).unwrap();
    assert_eq!(
        plan.projects[0].manifest["dependencies"],
        json!({"replacement":"link:new","declared":"^1.0.0"}),
    );
    assert_eq!(original[0].manifest["dependencies"], json!({"declared":"^1.0.0"}));
}

#[test]
fn deleting_the_link_option_does_not_retain_previously_merged_links() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let original = vec![Project { dir: root.to_path_buf(), manifest: serde_json::Map::default() }];
    let mut plan = InstallPlan {
        projects: vec![Project {
            dir: root.to_path_buf(),
            manifest: json!({"dependencies":{"obsolete":"link:old"}})
                .as_object()
                .unwrap()
                .clone(),
        }],
        ..Default::default()
    };
    subscriber_links(root, &mut plan, &original, &json!({})).unwrap();
    assert!(plan.projects[0].manifest.is_empty());
}
