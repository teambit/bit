use super::render;
use serde_json::json;

#[test]
fn renders_failure_and_skipped_cases_with_xml_escaping() {
    let data = json!([{"data":{"components":[{"componentId":"example.scope/sample@1.0.0","results":{"start":0,"testFiles":[{"file":"index.spec.js","tests":[{"name":"a & < b","status":"failed","duration":12,"failureErrOrStr":"failure\nmessage"},{"name":"later","status":"pending","duration":null}]}]}}]}}]);
    let xml = render(&data.to_string(), &json!({})).unwrap();
    assert_eq!(
        xml,
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<testsuites>\n  <testsuite name=\"example.scope/sample@1.0.0\" tests=\"2\" failures=\"1\" errors=\"0\" skipped=\"1\">\n    <testcase classname=\"index.spec.js\" name=\"a &amp; &lt; b\" time=\"0.012\">\n      <failure message=\"failure&#xA;message\"/>\n    </testcase>\n    <testcase classname=\"index.spec.js\" name=\"later\">\n      <skipped/>\n    </testcase>\n  </testsuite>\n</testsuites>",
    );
}
