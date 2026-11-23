//! Deleted workspace dependencies prefer installed versions while retaining the model fallback.

use super::{Request, apply};
use serde_json::json;

#[test]
fn removed_dependencies_and_extensions_use_installed_version_before_model() {
    let model = "a".repeat(40);
    for (removed, installed, expected) in [
        (false, "2.0.7", model.as_str()),
        (false, "latest", model.as_str()),
        (true, "2.0.7", "2.0.7"),
        (true, "latest", model.as_str()),
    ] {
        let mut request = json!({
            "entries":[{"identity":format!("sample.scope/env@{installed}"),"packageName":"@sample/env"}],
            "components":[[0],[],[]],
            "extensions":[format!("sample.scope/env@{installed}")],
            "sources":{"bitmap":[],"lane":[],"model":[format!("sample.scope/env@{model}")],"removed":[],"componentConfig":{}},
            "policy":{"manual":[{},{},{}],"envOwn":[],"workspace":{},"automatic":[{},{},{}],"merge":[{},{},{}],"prefix":null},
            "grammar":{},
        });
        if removed {
            request["sources"]["removed"] = json!(["sample.scope/env@0.0.1"]);
        }
        for field in 0..3 {
            request["components"] = json!([[], [], []]);
            request["components"][field] = json!([0]);
            let input: Request = serde_json::from_value(request.clone()).unwrap();
            let (_, output) = apply(&input).unwrap();
            assert_eq!(output["entries"][0]["identity"], format!("sample.scope/env@{expected}"));
            assert_eq!(output["extensions"][0], format!("sample.scope/env@{expected}"));
        }
        request["sources"]["componentConfig"] = json!({"sample.scope/env":"3.0.0"});
        let input: Request = serde_json::from_value(request).unwrap();
        let (_, output) = apply(&input).unwrap();
        assert_eq!(output["entries"][0]["identity"], "sample.scope/env@3.0.0");
        assert_eq!(output["extensions"][0], "sample.scope/env@3.0.0");
    }
}
