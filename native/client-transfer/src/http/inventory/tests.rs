use super::{Network, list_variables};
use crate::GlobalConfig;
use serde_json::json;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    thread,
};

#[test]
fn omitted_namespace_is_not_serialized_as_null() {
    assert_eq!(list_variables(None, false), json!({}));
    assert_eq!(list_variables(None, true), json!({"includeDeleted":true}));
    assert_eq!(list_variables(Some("ui/**"), false), json!({"namespaces":["ui/**"]}));
}

fn request(stream: &TcpStream) -> String {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut headers = String::new();
    let mut length = 0;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
            length = value.trim().parse().unwrap();
        }
        headers.push_str(&line);
        if line == "\r\n" {
            break;
        }
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body).unwrap();
    headers.push_str(&String::from_utf8(body).unwrap());
    headers
}

#[test]
fn older_server_retries_plain_list_once_and_returns_warning_receipt() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let bodies = [
            r#"{"errors":[{"message":"Unknown argument includeDeleted"}]}"#,
            r#"{"data":{"scope":{"components":[{"id":{"scope":"acme.ui","name":"button","version":"1.0.0"},"deprecation":{"isDeprecate":false}}]}}}"#,
        ];
        bodies
            .into_iter()
            .map(|body| {
                let (mut stream, _) = listener.accept().unwrap();
                let sent = request(&stream);
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\n\
                content-type: application/json\r\n\
                content-length: {}\r\n\
                connection: close\r\n\r\n{body}",
                    body.len(),
                )
                .unwrap();
                sent
            })
            .collect::<Vec<_>>()
    });
    let network = Network::new(&GlobalConfig::new(), "2.2.94", None, None).unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let (rows, warning) = runtime
        .block_on(network.inventory_with_warning(&url, None, true))
        .unwrap();
    assert!(warning);
    assert_eq!(rows, vec![json!({"id":"acme.ui/button@1.0.0","deprecated":false})]);
    let requests = server.join().unwrap();
    assert!(requests[0].contains("includeDeleted: $includeDeleted"));
    assert!(requests[1].contains("components(namespaces: $namespaces)"));
}
