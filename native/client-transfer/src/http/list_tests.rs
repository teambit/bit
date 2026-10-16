use super::{Listed, Network};
use crate::GlobalConfig;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    thread,
};

/// Answer one request with `body` and return the request as text.
fn serve_once(body: &'static str) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let handle = thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let mut request = String::new();
        let mut length = 0;
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                length = value.trim().parse().unwrap();
            }
            request.push_str(&line);
            if line == "\r\n" {
                break;
            }
        }
        let mut content = vec![0; length];
        reader.read_exact(&mut content).unwrap();
        request.push_str(&String::from_utf8(content).unwrap());
        let mut stream = stream;
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
            body.len(),
        )
        .unwrap();
        request
    });
    (url, handle)
}

#[test]
fn lists_a_remote_scope_with_node_fetch_headers() {
    let (url, server) = serve_once(
        r#"{"data":{"scope":{"components":[{"id":{"scope":"acme.ui","name":"button","version":"1.0.0"},"deprecation":{"isDeprecate":false}},{"id":{"scope":"acme.ui","name":"old","version":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"deprecation":{"isDeprecate":true}}]}}}"#,
    );
    let network = Network::new(&GlobalConfig::new(), "1.0.0", Some("local"), None).unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let listed = runtime
        .block_on(network.list(&url, Some("ui/**")))
        .unwrap();
    let request = server.join().unwrap();
    assert!(request.starts_with("POST /graphql "), "{request}");
    let lower = request.to_ascii_lowercase();
    assert!(lower.contains("user-agent: node-fetch\r\n"), "{request}");
    assert!(lower.contains("x-verb: read\r\n"), "{request}");
    assert!(request.contains(r#""variables":{"namespaces":["ui/**"]}"#), "{request}");
    assert_eq!(
        listed,
        [
            Listed {
                scope: "acme.ui".into(),
                name: "button".into(),
                version: Some("1.0.0".into()),
                deprecated: false,
            },
            Listed {
                scope: "acme.ui".into(),
                name: "old".into(),
                version: Some("a".repeat(40)),
                deprecated: true,
            },
        ],
    );
    assert_eq!(listed[0].id(), "acme.ui/button@1.0.0");
}

#[test]
fn lists_remote_lanes_with_node_projection() {
    let (url, server) = serve_once(
        r#"{"data":{"lanes":{"list":[{"id":{"name":"dev","scope":"acme.ui"},"components":[{"name":"button","scope":"acme.ui","version":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]},{"id":{"name":"main","scope":"acme.ui"},"components":[]}]}}}"#,
    );
    let network = Network::new(&GlobalConfig::new(), "1.0.0", Some("local"), None).unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let lanes = runtime
        .block_on(network.list_lanes(&url, None))
        .unwrap();
    let request = server.join().unwrap();
    assert!(request.starts_with("POST /graphql "), "{request}");
    assert!(request.contains("x-verb: read\r\n"), "{request}");
    assert!(request.contains("laneComponentIds"), "{request}");
    assert_eq!(
        lanes[0],
        serde_json::json!({
            "id": {"name":"dev","scope":"acme.ui"},
            "components": [{"id":"acme.ui/button@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","head":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],
        }),
    );
    assert_eq!(lanes[1]["id"]["name"], "main");
}

#[test]
fn a_list_error_is_reported() {
    let (url, server) =
        serve_once(r#"{"errors":[{"message":"access denied"}],"data":{"scope":null}}"#);
    let network = Network::new(&GlobalConfig::new(), "1.0.0", None, None).unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let error = runtime
        .block_on(network.list(&url, None))
        .unwrap_err();
    server.join().unwrap();
    assert_eq!(error.to_string(), "access denied");
}

#[test]
fn reads_remote_log_without_changing_the_graphql_projection() {
    let (url, server) = serve_once(
        r#"{"data":{"scope":{"getLogs":[{"message":"first\nsecond","username":null,"email":"author@example.com","date":"1800000000000","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tag":null}]}}}"#,
    );
    let network = Network::new(&GlobalConfig::new(), "1.0.0", Some("local"), None).unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let rows = runtime
        .block_on(network.log(&url, "acme.ui/button"))
        .unwrap();
    let request = server.join().unwrap();
    assert!(request.starts_with("POST /graphql "), "{request}");
    assert!(request.to_ascii_lowercase().contains("x-verb: read\r\n"), "{request}");
    assert!(request.contains(r#""variables":{"id":"acme.ui/button"}"#), "{request}");
    assert_eq!(rows[0]["message"], "first\nsecond");
    assert!(rows[0]["username"].is_null());
    assert_eq!(rows[0]["date"], "1800000000000");
}

#[test]
fn remote_log_rejects_graphql_errors_before_rendering() {
    let (url, server) =
        serve_once(r#"{"errors":[{"message":"access denied"}],"data":{"scope":null}}"#);
    let network = Network::new(&GlobalConfig::new(), "1.0.0", None, None).unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    assert_eq!(
        runtime
            .block_on(network.log(&url, "acme.ui/button"))
            .unwrap_err()
            .to_string(),
        "access denied",
    );
    server.join().unwrap();
}

#[test]
fn remote_log_rejects_an_oversized_response() {
    let body = format!(r#"{{"padding":"{}"}}"#, "x".repeat(8 * 1024 * 1024));
    let (url, server) = serve_once(Box::leak(body.into_boxed_str()));
    let network = Network::new(&GlobalConfig::new(), "1.0.0", None, None).unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    assert_eq!(
        runtime
            .block_on(network.log(&url, "acme.ui/button"))
            .unwrap_err()
            .to_string(),
        "remote log exceeds bounds",
    );
    server.join().unwrap();
}
