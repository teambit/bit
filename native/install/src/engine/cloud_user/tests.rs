use super::{LOOKUP_TIMEOUT, cloud_username};
use crate::model::GlobalConfig;
use serde_json::json;
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
    time::Duration,
};

/// Answer one request with `body` and return what was received.
fn serve_once(body: &'static str) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut received = Vec::new();
        let mut buffer = [0; 4096];
        loop {
            let read = stream.read(&mut buffer).unwrap();
            received.extend_from_slice(&buffer[..read]);
            let text = String::from_utf8_lossy(&received);
            if text.contains("\r\n\r\n") && text.trim_end().ends_with('}') {
                break;
            }
        }
        let head = format!(
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
            body.len(),
        );
        stream.write_all(head.as_bytes()).unwrap();
        stream.write_all(body.as_bytes()).unwrap();
        String::from_utf8_lossy(&received).into_owned()
    });
    (url, handle)
}

fn global(symphony: &str, token: Option<&str>) -> GlobalConfig {
    let mut global = GlobalConfig::new();
    global.insert("symphony_url".into(), json!(symphony));
    if let Some(token) = token {
        global.insert("user.token".into(), json!(token));
    }
    global
}

#[tokio::test]
async fn asks_the_cloud_for_the_logged_in_user() {
    let (url, server) = serve_once(r#"{"data":{"me":{"id":"1","username":"zoe"}}}"#);
    let username = cloud_username(&global(&url, Some("t0k3n")), LOOKUP_TIMEOUT).await;
    assert_eq!(username.as_deref(), Some("zoe"));
    let request = server.join().unwrap();
    assert!(request.starts_with("POST /graphql HTTP/1.1"));
    assert!(request.contains("authorization: Bearer t0k3n"));
    assert!(request.contains("query GET_ME"));
}

#[tokio::test]
async fn stays_anonymous_without_a_token_or_an_answer() {
    assert_eq!(cloud_username(&global("http://127.0.0.1:1", None), LOOKUP_TIMEOUT).await, None);
    let (url, server) = serve_once(r#"{"errors":[{"message":"unauthorized"}]}"#);
    assert_eq!(cloud_username(&global(&url, Some("expired")), LOOKUP_TIMEOUT).await, None);
    server.join().unwrap();
    let unreachable = global("http://127.0.0.1:1", Some("t0k3n"));
    assert_eq!(cloud_username(&unreachable, Duration::from_millis(500)).await, None);
}
