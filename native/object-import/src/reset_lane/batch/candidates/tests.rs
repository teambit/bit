use super::{Discovery, ordered, staged};
use crate::reset_lane::{Heads, Repository, diagnostics, object_path, outbound, selection};
use serde_json::json;
use std::{
    collections::HashSet,
    fs,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

#[test]
fn model_index_order_overrides_lane_and_alphabetical_order() {
    let index = json!({"components":[{"id":{"scope":"scope","name":"zed"}},{"id":{"scope":"scope","name":"alpha"}},{"id":{"scope":"scope","name":"unrelated"}}]});
    let membership = HashSet::from(["scope/alpha".to_owned(), "scope/zed".to_owned()]);
    assert_eq!(ordered(&index, &membership).expect("index order"), ["scope/zed", "scope/alpha"]);
}

#[test]
fn candidate_discovery_avoids_unknown_replacement_and_lane_history_validation() {
    let root = std::env::temp_dir()
        .join(format!(
            "bit-reset-discovery-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
    let objects = root.join("objects");
    let old = "1111111111111111111111111111111111111111";
    let current = "2222222222222222222222222222222222222222";
    for (hash, parents) in [(old, vec![]), (current, vec![old])] {
        let path = object_path(&objects, hash);
        fs::create_dir_all(path.parent().expect("parent")).expect("directory");
        fs::write(
            path,
            outbound::encode_object(
                hash,
                "Version",
                &json!({"parents":parents,"origin":{"lane":{"scope":"scope","name":"other"}}}),
            )
            .expect("encode"),
        )
        .expect("version");
    }
    let repository = Repository {
        reads: Vec::new(),
        objects: objects.clone(),
        lane_scope: "scope".into(),
        lane_name: "new-lane".into(),
        lane_hash: "3333333333333333333333333333333333333333".into(),
        lane: json!({"scope":"scope","name":"new-lane","components":[]}),
        heads: Heads { current: current.into(), remote: None, baseline: None },
        model: json!({"name":"inherited","scope":"scope","versions":{}}),
    };
    let mut discovery =
        Discovery { identities: Vec::new(), population: Vec::new(), proofs: Vec::new(), objects };
    assert!(staged(&repository, &mut discovery).expect("candidate graph only"));
    let selected = selection::select(&repository, false).expect("graph selection");
    let error = selection::validate_replacement(&repository, &selected, true)
        .expect_err("actual reset has no known boundary");
    assert!(
        diagnostics::diagnostic(&error)
            .expect("published error")
            .contains("unable to find a new head"),
    );
    assert!(!discovery.population.is_empty());
    fs::remove_dir_all(root).expect("cleanup");
}
