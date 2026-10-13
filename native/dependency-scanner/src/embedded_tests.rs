use crate::{limits, protocol, scan_request};
use rayon::ThreadPoolBuilder;
use serde_json::json;
use std::fmt::Write;

#[test]
fn embedded_preserves_standalone_results_and_order_across_worker_batches() {
    let pool = ThreadPoolBuilder::new()
        .num_threads(2)
        .build()
        .unwrap();
    let files = vec![
        json!({"path":"a.ts","source":"import type { A } from 'types'; export { A };"}),
        json!({"path":"b.js","source":"const x = require('common'); import('dynamic');"}),
        json!({"path":"c.ts","source":"import {"}),
        json!({"path":"d.css","source":"@import 'styles';"}),
        json!({"path":"e.ts","source":"// @bit-ignore\nimport { A } from 'ignored';"}),
    ];
    for options in [json!({}), json!({"custom":true})] {
        let input = json!({"version":1,"id":37,"files":files,"options":options}).to_string();
        assert_eq!(
            scan_request(&input, &pool).unwrap(),
            protocol::process_request(&input, &pool).unwrap(),
        );
    }
}

#[test]
fn embedded_declines_invalid_or_unbounded_requests() {
    let pool = ThreadPoolBuilder::new()
        .num_threads(1)
        .build()
        .unwrap();
    for input in [
        json!({"version":2,"files":[]}).to_string(),
        json!({"version":1,"files":vec![json!({"path":"a.ts","source":""});4097]}).to_string(),
        " ".repeat(limits::REQUEST_BYTES + 1),
    ] {
        assert_eq!(scan_request(&input, &pool).unwrap()["status"], "invalid_request");
    }
    assert!(scan_request("{", &pool).is_err());
}

#[test]
fn embedded_bounds_expanded_dependency_metadata() {
    let pool = ThreadPoolBuilder::new()
        .num_threads(2)
        .build()
        .unwrap();
    let mut source = String::new();
    for index in 0..1000 {
        writeln!(&mut source, "import {{ v{index} }} from 'dep{index}';").unwrap();
    }
    let input = json!({
        "version":1,
        "files":vec![json!({"path":"a.ts","source":source});100],
    })
    .to_string();
    assert!(input.len() < limits::REQUEST_BYTES);
    assert_eq!(scan_request(&input, &pool).unwrap()["status"], "invalid_request");
}

#[test]
fn captured_source_entrypoint_preserves_embedded_outcomes() {
    let pool = ThreadPoolBuilder::new()
        .num_threads(2)
        .build()
        .unwrap();
    for (path, source) in [
        ("a.ts", "import {x} from './x';"),
        ("a.js", "require('pkg');"),
        ("a.ts", "const = ;"),
        ("a.js", "require('2');"),
    ] {
        let input = json!({"version":1,"files":[{"path":path,"source":source}]}).to_string();
        assert_eq!(
            crate::scan_source(path.into(), source.into()).unwrap(),
            scan_request(&input, &pool).unwrap()["files"][0],
        );
    }
}
