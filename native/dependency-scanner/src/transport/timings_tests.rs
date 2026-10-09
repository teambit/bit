use super::{options, serve, serve_profiled, tests::BrokenWriter};
use crate::protocol::{process_request, process_with_metrics};
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, Cursor},
    time::{SystemTime, UNIX_EPOCH},
};

#[test]
fn profiling_preserves_wire_responses_and_reports_real_stages() {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir()
        .join(format!("bit-scanner-timings-{}-{suffix}.ts", std::process::id()));
    fs::write(&path, "import type { Value } from './disk';").unwrap();
    let input = format!(
        "{}\n",
        json!({"version":1,"id":"timed","files":[
            {"path":path,"kind":"ts"},
            {"path":"inline.js","source":"import { value } from './inline';"}
        ]}),
    );
    let mut bytes = vec![0xff, b'\n'];
    bytes.extend_from_slice(input.as_bytes());
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(2)
        .build()
        .unwrap();
    let mut ordinary = Vec::new();
    serve(&mut Cursor::new(&bytes), &mut ordinary, |line| process_request(line, &pool)).unwrap();
    let mut timed = Vec::new();
    let mut diagnostics = Vec::new();
    serve_profiled(
        &mut Cursor::new(&bytes),
        &mut timed,
        &mut diagnostics,
        true,
        |line, metrics| process_with_metrics(line, &pool, metrics),
    )
    .unwrap();
    fs::remove_file(path).unwrap();
    assert_eq!(ordinary, timed);
    let records: Vec<Value> = String::from_utf8(diagnostics)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(records.len(), 2);
    assert_eq!(records[0]["status"], "invalid_request");
    assert_eq!(records[0]["request_index"], 1);
    assert_eq!(records[0]["durations"]["oxc_parse_ns"], 0);
    assert_eq!(records[1]["request_index"], 2);
    assert_eq!(records[1]["files"], json!({"requested":2,"inline_sources":1}));
    for stage in [
        "source_read_ns",
        "oxc_parse_ns",
        "extraction_ns",
        "request_decode_ns",
        "response_serialize_write_ns",
        "batch_wall_ns",
    ] {
        assert!(records[1]["durations"][stage].as_u64().unwrap() > 0, "{stage}");
    }
}
#[test]
fn disabled_diagnostics_do_not_write_even_to_a_broken_sink() {
    let mut output = Vec::new();
    serve_profiled(
        &mut Cursor::new(b"{}\n"),
        &mut output,
        &mut BrokenWriter,
        false,
        |_, metrics| {
            assert!(metrics.is_none());
            Ok(json!({"ok":true}))
        },
    )
    .unwrap();
    assert_eq!(output, b"{\"ok\":true}\n");
}
#[test]
fn diagnostic_output_failure_is_explicit() {
    let error = serve_profiled(
        &mut Cursor::new(b"{}\n"),
        &mut Vec::new(),
        &mut BrokenWriter,
        true,
        |_, _| Ok(json!({"ok":true})),
    )
    .unwrap_err();
    assert_eq!(error.kind(), io::ErrorKind::BrokenPipe);
}
#[test]
fn flags_are_explicit_and_order_independent() {
    for args in [["--timings", "--threads", "2"], ["--threads", "2", "--timings"]] {
        let parsed = options(&args.map(String::from)).unwrap();
        assert!(parsed.timings);
        assert_eq!(parsed.threads, 2);
    }
    assert!(!options(&["--threads".into(), "1".into()]).unwrap().timings);
    assert!(options(&["--timings".into(), "--timings".into()]).is_err());
    assert!(options(&["--threads".into()]).is_err());
    assert!(options(&["--threads".into(), "0".into()]).is_err());
}
