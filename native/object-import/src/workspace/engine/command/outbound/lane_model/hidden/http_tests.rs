//! Unit tests for HTTP fetching ([`fetch_http`], [`model`]) of hidden lane model update-dependent objects in `bit-object-import`.
//!
//! Verifies [`tar`] [`ObjectItem`] stream extraction and [`GlobalConfig`] [`Network`] HTTP status handling for remote hidden lane models.

use super::{fetch_http, model};
use bit_client_transfer::{
    GlobalConfig,
    http::Network,
    tar::{self, ObjectItem},
};
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    thread,
};

/// Spawns a single-request local HTTP test server returning `status` and `body`, capturing the request payload.
fn serve(status: &str, body: Vec<u8>) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let status = status.to_owned();
    let worker = thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        let mut reader = BufReader::new(socket.try_clone().unwrap());
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
        let mut request = vec![0; length];
        reader.read_exact(&mut request).unwrap();
        write!(
            socket,
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len(),
        )
        .unwrap();
        socket.write_all(&body).unwrap();
        format!("{headers}{}", String::from_utf8(request).unwrap())
    });
    (url, worker)
}
/// Constructs a test [`Network`] client configured with default [`GlobalConfig`] settings.
fn network() -> Network {
    Network::new(&GlobalConfig::new(), "2.2.94", Some("local.scope"), None).unwrap()
}
/// Verifies that [`fetch_http`] fetches a remote `Lane` object via `POST /api/scope/fetch` and retains `updateDependents`.
#[test]
fn fetches_remote_lane_and_retains_hidden_entries() {
    let hash = "a".repeat(40);
    let lane = json!({"scope":"example.scope","name":"dev","components":[],"updateDependents":[format!("example.scope/hidden@{}", "b".repeat(40))]});
    let item = ObjectItem {
        hash: hash.clone(),
        compressed: model::encode(&hash, "Lane", &lane).unwrap(),
        scope: None,
    };
    let (url, server) = serve("200 OK", tar::pack(&[item], 1024 * 1024).unwrap());
    assert_eq!(fetch_http(&network(), &url, "example.scope", "dev").unwrap(), Some(lane));
    let request = server.join().unwrap();
    assert!(request.starts_with("POST /api/scope/fetch "));
    let body: Value = serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(body["ids"], json!(["example.scope/dev"]));
    assert_eq!(body["fetchOptions"]["type"], "lane");
}
/// Verifies that [`fetch_http`] treats HTTP `404` with error code `138` (`LaneNotFound`) as an absent lane (`Ok(None)`) while surfacing other `404` codes as errors.
#[test]
fn only_lane_not_found_is_treated_as_an_absent_lane() {
    for (code, absent) in [(138, true), (129, false), (130, false)] {
        let body =
            serde_json::to_vec(&json!({"error":{"code":code,"message":"example error"}})).unwrap();
        let (url, server) = serve("404 Not Found", body);
        let result = fetch_http(&network(), &url, "example.scope", "dev");
        if absent {
            assert!(result.unwrap().is_none());
        } else {
            assert!(result.is_err());
        }
        server.join().unwrap();
    }
}
