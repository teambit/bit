//! Actual Node 22.22.0 / Bit 2.2.94 default `zlib.deflate` byte captures.
//! Inputs retain the exact original logical header and JSON payload. The four
//! corpus pairs are windows-037, windows-033, windows-050 and history-1; no Node
//! process or host system zlib is required when these cross-platform tests run.

#[test]
fn scope_metadata_matches_the_released_node_compressed_stream() {
    exact(
        include_bytes!("compression/scope-meta.serialized"),
        include_bytes!("compression/scope-meta.node.zlib"),
    );
}

#[test]
fn component_matches_the_released_node_compressed_stream() {
    exact(
        include_bytes!("compression/component.serialized"),
        include_bytes!("compression/component.node.zlib"),
    );
}

#[test]
fn version_history_matches_the_released_node_compressed_stream() {
    exact(
        include_bytes!("compression/version-history.serialized"),
        include_bytes!("compression/version-history.node.zlib"),
    );
}

#[test]
fn lane_history_matches_the_released_node_compressed_stream() {
    exact(
        include_bytes!("compression/lane-history.serialized"),
        include_bytes!("compression/lane-history.node.zlib"),
    );
}

fn exact(serialized: &[u8], compressed: &[u8]) {
    let boundary = serialized
        .iter()
        .position(|byte| *byte == 0)
        .unwrap();
    let header = std::str::from_utf8(&serialized[..boundary]).unwrap();
    let mut fields = header.split(' ');
    let kind = fields.next().unwrap();
    let hash = fields.next().unwrap();
    let length = fields
        .next()
        .unwrap()
        .parse::<usize>()
        .unwrap();
    assert!(fields.next().is_none());
    let payload = std::str::from_utf8(&serialized[boundary + 1..]).unwrap();
    assert_eq!(payload.encode_utf16().count(), length);
    let value: serde_json::Value = serde_json::from_str(payload).unwrap();
    assert_eq!(super::super::serialized(hash, kind, &value).unwrap(), serialized);
    let object = super::super::object(hash, kind, value).unwrap();
    assert_eq!(object.inflated_size, serialized.len());
    assert_eq!(object.bytes, compressed, "{kind}: default Node compression bytes");
    assert_eq!(
        crate::checkout::repository::inflate(&object.bytes, serialized.len()).unwrap(),
        serialized,
    );
}
