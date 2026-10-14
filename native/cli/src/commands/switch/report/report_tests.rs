use super::{Chalk, Options, format};
use serde_json::json;

#[test]
fn reports_an_empty_switch() {
    let report = format(
        &json!({"components":[],"failedComponents":[]}),
        &Options { lane: "main".into(), verbose: false, force_ours: false, force_theirs: false },
        Chalk::new(false),
    )
    .unwrap();
    assert_eq!(
        report.data,
        "No components have been changed.\n✔ successfully set \"main\" as the active lane",
    );
}
