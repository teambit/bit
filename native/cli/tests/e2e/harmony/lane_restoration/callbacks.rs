use super::fixture;
use crate::{
    commands::move_paths::support,
    harmony::lane_adoption::{callbacks::installation_fixture, output::durations},
    helper::{Helper, config, remote},
};
use serde_json::Value;

fn prepared() -> (Helper, String) {
    let helper = installation_fixture();
    support::setup(&helper, "switch dev -x");
    let history = fixture::latest(&helper);
    helper.append_file("comp1/index.js", "\n// later history body\n");
    support::setup(&helper, "snap --ignore-issues * --message later");
    remote::publish(&helper);
    helper.output_file("lane-adoption-record-phases", "active");
    (helper, history)
}

#[test]
fn historical_revert_installs_and_compiles_in_the_same_real_provider_session() {
    let (helper, history) = prepared();
    let before = fixture::version(&helper, "comp1");
    let output = support::compare_install(&helper, &format!("lane revert {history}"), durations);
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    assert_eq!(output.stdout.matches("lane adoption configured provider started").count(), 1);
    assert_eq!(fixture::version(&helper, "comp1"), before);
    assert!(helper.scopes.local_path.join("pnpm-lock.yaml").is_file());
    assert!(helper.scopes.local_path.join("node_modules/.modules.yaml").is_file());
    assert_phase_order(&helper);
    let module =
        config::read_jsonc(&helper.scopes.local_path.join("lane-adoption-provider-receipt.json"));
    assert!(
        std::path::Path::new(module["module"].as_str().unwrap())
            .ends_with(std::path::Path::new("dist").join("index.js")),
    );
}

fn assert_phase_order(helper: &Helper) {
    let text = std::fs::read_to_string(helper.scopes.local_path.join("lane-adoption-phases.jsonl"))
        .unwrap();
    let rows: Vec<Value> = text
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    let position = |phase| {
        rows.iter()
            .position(|row| row["phase"] == phase)
            .unwrap()
    };
    assert!(position("onLoad") < position("preInstall"), "{text}");
    assert!(position("preInstall") < position("postInstall"), "{text}");
    assert!(position("postInstall") < position("compile"), "{text}");
    for row in rows {
        assert_eq!(row["consumerLane"], "dev");
        assert!(
            row["diskLane"]
                .as_str()
                .unwrap()
                .ends_with("/dev"),
        );
    }
}

#[test]
fn real_onload_failure_preserves_the_exact_owned_prefix_before_historical_writes() {
    let (helper, history) = prepared();
    helper.output_file("lane-history-fail-load", "active");
    let bitmap = support::bitmap(&helper);
    let source = std::fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    let output =
        support::compare_with_stdout(&helper, &format!("lane revert {history} -x"), durations);
    assert!(!output.status.success());
    assert!(format!("{}{}", output.stdout, output.stderr).contains(
        "lane history actual onLoad failure"
    ));
    assert_eq!(support::bitmap(&helper), bitmap);
    assert_eq!(std::fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(), source);
}
