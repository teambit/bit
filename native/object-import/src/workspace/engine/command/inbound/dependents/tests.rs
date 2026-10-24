use super::select;
use crate::command_import::Target;
use std::collections::HashMap;

fn target(name: &str, version: &str) -> Target {
    Target { scope: Some("scope".into()), name: name.into(), version: version.into() }
}
#[test]
fn paths_exclude_direct_dependencies_and_filter_every_via_node() {
    let graph = HashMap::from([
        ("scope/root@1.0.0".into(), vec![target("left", "1.0.0"), target("right", "1.0.0")]),
        ("scope/left@1.0.0".into(), vec![target("end", "1.0.0")]),
        ("scope/right@1.0.0".into(), vec![target("middle", "1.0.0")]),
        ("scope/middle@1.0.0".into(), vec![target("end", "1.0.0")]),
    ]);
    let sources = vec!["scope/root@1.0.0".into()];
    let ends = vec![target("end", "latest")];
    let all = select(&graph, &sources, &ends, &[]).unwrap();
    assert_eq!(
        all.iter()
            .map(|row| row.name.as_str())
            .collect::<Vec<_>>(),
        ["left", "right", "middle"],
    );
    let through = select(&graph, &sources, &ends, &["scope/middle".into()]).unwrap();
    assert_eq!(
        through
            .iter()
            .map(|row| row.name.as_str())
            .collect::<Vec<_>>(),
        ["right", "middle"],
    );
    assert!(select(&graph, &sources, &[target("left", "latest")], &[]).unwrap().is_empty());
}
#[test]
fn distinct_versions_of_a_dependent_request_latest_once() {
    let graph = HashMap::from([
        ("scope/root@1.0.0".into(), vec![target("shared", "1.0.0"), target("shared", "2.0.0")]),
        ("scope/shared@1.0.0".into(), vec![target("end", "1.0.0")]),
        ("scope/shared@2.0.0".into(), vec![target("end", "1.0.0")]),
    ]);
    let result =
        select(&graph, &["scope/root@1.0.0".into()], &[target("end", "latest")], &[]).unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].version, "latest");
}

#[test]
fn dense_workspace_graph_rejects_path_explosion_before_the_processed_limit() {
    let sources = (0..512)
        .map(|index| format!("scope/root{index}@1.0.0"))
        .collect::<Vec<_>>();
    let children = (0..512)
        .map(|index| target(&format!("child{index}"), "1.0.0"))
        .collect::<Vec<_>>();
    let graph = sources
        .iter()
        .map(|id| (id.clone(), children.clone()))
        .collect();
    let error = select(&graph, &sources, &[target("absent", "latest")], &[]).err().unwrap();
    assert_eq!(error.to_string(), "inbound dependent graph path payload limit");
}

#[test]
fn initial_source_payload_is_bounded_before_it_enters_the_queue() {
    let sources = vec!["x".repeat(1024 * 1024); 33];
    let error = select(&HashMap::new(), &sources, &[target("end", "latest")], &[]).err().unwrap();
    assert_eq!(error.to_string(), "inbound dependent graph path payload limit");
}
