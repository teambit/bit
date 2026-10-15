use super::{GlobalConfig, Network};
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
    time::Duration,
};

#[test]
fn action_posts_canonical_route_headers_and_json() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (mut connection, _) = listener.accept().unwrap();
        connection
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut request = Vec::new();
        let mut chunk = [0; 4096];
        let body_start = loop {
            let count = connection.read(&mut chunk).unwrap();
            assert!(count > 0, "request ended before headers");
            request.extend_from_slice(&chunk[..count]);
            if let Some(start) = request
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
            {
                break start + 4;
            }
        };
        let headers = String::from_utf8(request[..body_start].to_vec()).unwrap();
        let length: usize = headers
            .lines()
            .find_map(|line| {
                line.to_ascii_lowercase()
                    .strip_prefix("content-length: ")
                    .and_then(|value| value.parse().ok())
            })
            .unwrap();
        while request.len() - body_start < length {
            let count = connection.read(&mut chunk).unwrap();
            assert!(count > 0, "request ended before body");
            request.extend_from_slice(&chunk[..count]);
        }
        assert!(headers.starts_with("POST /api/scope/action HTTP/1.1\r\n"));
        assert!(headers.to_ascii_lowercase().contains("x-verb: write\r\n"));
        assert!(headers.contains("x-client-version: 1.2.3\r\n"));
        assert!(headers.contains("x-request-scope: local.scope\r\n"));
        let body: Value =
            serde_json::from_slice(&request[body_start..body_start + length]).unwrap();
        assert_eq!(
            body,
            json!({"name":"ExportValidate","options":{
                "clientId":"test-client","isResumingExport":true
            }}),
        );
        connection
            .write_all(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}",
            )
            .unwrap();
    });
    let network = Network::new(&GlobalConfig::new(), "1.2.3", Some("local.scope"), None).unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let result = runtime
        .block_on(network.action(
            &format!("http://{address}"),
            "ExportValidate",
            &json!({"clientId":"test-client","isResumingExport":true}),
        ))
        .unwrap();
    assert_eq!(result, json!({}));
    server.join().unwrap();
}
