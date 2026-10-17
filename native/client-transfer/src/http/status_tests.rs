use super::{GlobalConfig, Network};
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
};

#[test]
fn unsuccessful_uploads_preserve_published_exception_primary_messages() {
    for (body, expected) in [
        ("{}", Some("unknown error")),
        (r#"{"message":"scope rejected upload"}"#, Some("scope rejected upload")),
        ("not JSON", None),
        (r#"{"error":{"code":132,"message":"custom rejection"}}"#, Some("custom rejection")),
        (
            r#"{"code":127,"id":"remote.scope/foo@0.0.1"}"#,
            Some(r#"error: component "remote.scope/foo@0.0.1" was not found"#),
        ),
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = reject(listener, body);
        let network = Network::new(&GlobalConfig::new(), "2.2.94", None, None).unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let error = runtime
            .block_on(network.push(&url, "client", Vec::new()))
            .unwrap_err();
        let expected = expected.map_or_else(
            || format!("url: {url}/api/scope/put. status: 500. text: Internal Server Error"),
            str::to_owned,
        );
        assert_eq!(error.to_string(), expected, "response: {body}");
        server.join().unwrap();
    }
}
fn reject(listener: TcpListener, body: &'static str) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        assert!(socket.read(&mut [0; 4096]).unwrap() > 0);
        write!(
            socket,
            "HTTP/1.1 500 Internal Server Error\r\n\
            Content-Type: application/json\r\n\
            Content-Length: {}\r\n\
            Connection: close\r\n\
            \r\n\
            {body}",
            body.len(),
        )
        .unwrap();
    })
}
