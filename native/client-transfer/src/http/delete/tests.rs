use super::super::Network;
use crate::{Cancellation, GlobalConfig};
use serde_json::{Value, json};
use std::{
    io::{self, BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    sync::mpsc,
    thread,
    time::Duration,
};

fn network(cancellation: Option<Cancellation>) -> Network {
    let mut global = GlobalConfig::new();
    global.insert("network.fetch_retries".to_owned(), json!(2));
    global.insert("network.fetch_retry_mintimeout".to_owned(), json!(1));
    let network = Network::new(&global, "2.2.94", Some("local.scope"), Some("secret")).unwrap();
    match cancellation {
        Some(owner) => network.with_cancellation(owner),
        None => network,
    }
}

fn request(stream: &TcpStream) -> String {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut text = String::new();
    let mut length = 0;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        assert!(!line.is_empty(), "request ended before header terminator");
        if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
            length = value.trim().parse().unwrap();
        }
        text.push_str(&line);
        if line == "\r\n" {
            break;
        }
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body).unwrap();
    text.push_str(&String::from_utf8(body).unwrap());
    text
}

fn serve(reply: Option<&'static str>) -> (String, thread::JoinHandle<(String, bool)>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let observed = request(&stream);
        if let Some(reply) = reply {
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\
                content-length: {}\r\nconnection: close\r\n\r\n{reply}",
                reply.len(),
            )
            .unwrap();
        }
        drop(stream);
        listener.set_nonblocking(true).unwrap();
        thread::sleep(Duration::from_millis(100));
        let retried = match listener.accept() {
            Ok(_) => true,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => false,
            Err(error) => panic!("second accept failed: {error}"),
        };
        (observed, retried)
    });
    (url, handle)
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

#[test]
fn scope_delete_sends_one_authenticated_post_and_keeps_reply() {
    let body = r#"{"removedComponentIds":["remote.scope/alpha"],"missingComponents":[],"dependentBits":{}}"#;
    let (url, server) = serve(Some(body));
    let ids = vec!["remote.scope/alpha".to_owned()];
    let result = runtime()
        .block_on(network(None).delete_scope(&url, &ids, true))
        .unwrap();
    assert_eq!(result["removedComponentIds"], json!(["remote.scope/alpha"]));
    let (observed, retried) = server.join().unwrap();
    assert!(!retried);
    assert!(observed.starts_with("POST /api/scope/delete "), "{observed}");
    let lower = observed.to_ascii_lowercase();
    assert!(lower.contains("authorization: bearer secret\r\n"), "{observed}");
    assert!(lower.contains("x-request-scope: local.scope\r\n"), "{observed}");
    assert!(lower.contains("x-verb: write\r\n"), "{observed}");
    let sent: Value = serde_json::from_str(
        observed
            .split("\r\n\r\n")
            .nth(1)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(sent, json!({"ids":["remote.scope/alpha"],"force":true,"lanes":false}));
    assert!(observed.ends_with(r#"{"ids":["remote.scope/alpha"],"force":true,"lanes":false}"#));
}

#[test]
fn scope_lane_delete_uses_lanes_flag_once() {
    let body = r#"{"removedComponentIds":[],"missingComponents":[],"dependentBits":{},"removedLanes":["remote.scope/dev"]}"#;
    let (url, server) = serve(Some(body));
    let ids = vec!["remote.scope/dev".to_owned()];
    let result = runtime()
        .block_on(network(None).delete_scope_lanes(&url, &ids, false))
        .unwrap();
    assert_eq!(result["removedLanes"], json!(["remote.scope/dev"]));
    let (observed, retried) = server.join().unwrap();
    assert!(!retried);
    assert!(observed.starts_with("POST /api/scope/delete "));
    assert!(observed.ends_with(r#"{"ids":["remote.scope/dev"],"force":false,"lanes":true}"#));
}

#[test]
fn hub_delete_reads_last_end_record_and_sends_options_once() {
    let body = concat!(
        "{\"message\":\"deleting\"}\n",
        "{\"end\":true,\"data\":{\"removedComponentIds\":[],\"missingComponents\":[],\"dependentBits\":{}}}\n",
    );
    let (url, server) = serve(Some(body));
    let ids = vec!["remote.scope/alpha@latest".to_owned()];
    let result = runtime()
        .block_on(network(None).delete_hub(&url, &ids, false))
        .unwrap();
    assert_eq!(result["removedComponentIds"], json!([]));
    let (observed, retried) = server.join().unwrap();
    assert!(!retried);
    assert!(observed.starts_with("POST /api/delete "), "{observed}");
    let lower = observed.to_ascii_lowercase();
    assert!(lower.contains(r#"delete-options: {"force":false,"idsarelanes":false}"#), "{observed}");
    let sent: Value = serde_json::from_str(
        observed
            .split("\r\n\r\n")
            .nth(1)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(sent, json!({"componentIds":["remote.scope/alpha@latest"]}));
    assert!(observed.ends_with(r#"{"componentIds":["remote.scope/alpha@latest"]}"#));
}

#[test]
fn hub_lane_delete_uses_lane_ids_and_options_once() {
    let body = "{\"end\":true,\"data\":{\"removedComponentIds\":[],\"missingComponents\":[],\"dependentBits\":{},\"removedLanes\":[\"remote.scope/dev\"]}}\n";
    let (url, server) = serve(Some(body));
    let ids = vec!["remote.scope/dev".to_owned()];
    let result = runtime()
        .block_on(network(None).delete_hub_lanes(&url, &ids, true))
        .unwrap();
    assert_eq!(result["removedLanes"], json!(["remote.scope/dev"]));
    let (observed, retried) = server.join().unwrap();
    assert!(!retried);
    assert!(observed.starts_with("POST /api/delete "));
    let lower = observed.to_ascii_lowercase();
    assert!(lower.contains(r#"delete-options: {"force":true,"idsarelanes":true}"#));
    assert!(observed.ends_with(r#"{"laneIds":["remote.scope/dev"]}"#));
}

#[test]
fn hub_delete_reports_final_stream_error_without_replay() {
    let body = "{\"message\":\"working\"}\n{\"end\":true,\"message\":\"denied\",\"data\":{\"isError\":true}}\n";
    let (url, server) = serve(Some(body));
    let ids = vec!["remote.scope/alpha@latest".to_owned()];
    let result = runtime().block_on(network(None).delete_hub(&url, &ids, false));
    assert!(
        result
            .unwrap_err()
            .to_string()
            .contains("denied"),
    );
    let (observed, retried) = server.join().unwrap();
    assert!(observed.starts_with("POST /api/delete "));
    assert!(!retried);
}

#[test]
fn disconnect_after_post_is_ambiguous_and_is_never_retried() {
    let (url, server) = serve(None);
    let ids = vec!["remote.scope/alpha".to_owned()];
    let result = runtime().block_on(network(None).delete_scope(&url, &ids, false));
    assert!(result.is_err());
    let (observed, retried) = server.join().unwrap();
    assert!(observed.starts_with("POST /api/scope/delete "), "{observed}");
    assert!(!retried, "ambiguous delete was replayed");
}

#[test]
fn redirect_cannot_repeat_delete_post() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let redirect = format!("{url}/again");
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let observed = request(&stream);
        write!(
            stream,
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: {redirect}\r\n\
            Content-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .unwrap();
        drop(stream);
        listener.set_nonblocking(true).unwrap();
        thread::sleep(Duration::from_millis(100));
        assert!(
            matches!(listener.accept(), Err(error) if error.kind() == io::ErrorKind::WouldBlock),
        );
        observed
    });
    let ids = vec!["remote.scope/alpha".to_owned()];
    assert!(
        runtime()
            .block_on(network(None).delete_scope(&url, &ids, false))
            .is_err(),
    );
    assert!(
        server
            .join()
            .unwrap()
            .starts_with("POST /api/scope/delete "),
    );
}

#[test]
fn cancellation_after_dispatch_is_ambiguous_and_is_not_retried() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let (seen, received) = mpsc::channel();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let observed = request(&stream);
        stream.write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 4096\r\n\r\n").unwrap();
        seen.send(()).unwrap();
        thread::sleep(Duration::from_millis(100));
        observed
    });
    let owner = Cancellation::new();
    let to_cancel = owner.clone();
    let cancel = thread::spawn(move || {
        received.recv().unwrap();
        to_cancel.cancel();
    });
    let ids = vec!["remote.scope/alpha".to_owned()];
    let result = runtime().block_on(network(Some(owner)).delete_scope(&url, &ids, false));
    assert_eq!(result.unwrap_err().kind(), io::ErrorKind::Interrupted);
    cancel.join().unwrap();
    assert!(
        server
            .join()
            .unwrap()
            .starts_with("POST /api/scope/delete "),
    );
}
