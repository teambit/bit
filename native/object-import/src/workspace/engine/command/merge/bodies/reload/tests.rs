use super::retain;
use serde_json::json;
use std::path::Path;

#[test]
fn reload_keeps_surviving_current_sources_without_replacing_writer_outputs_or_removals() {
    let root = Path::new("workspace");
    let plan = json!({"currentFiles":[
        {"relativePath":"same.js","planIndex":1,"spoolHash":"old"},
        {"relativePath":"removed.js","planIndex":2,"spoolHash":"removed"},
        {"relativePath":"local.js","planIndex":3,"spoolHash":"local"}
    ]});
    let output = vec![json!({"relativePath":"same.js","planIndex":9,"source":{"spoolHash":"new"}})];
    let files = retain(root, &plan, output.clone(), &[root.join("removed.js")]).unwrap();
    assert_eq!(files.len(), 2);
    assert_eq!(files[0], output[0]);
    assert_eq!(files[1]["source"], plan["currentFiles"][2]);
}
