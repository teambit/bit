use super::{GlobalConfig, Network};
use crate::{Cancellation, fetch::FetchOptions};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    thread,
    time::Duration,
};

fn archive(end: bool) -> Vec<u8> {
    let mut tar = tar::Builder::new(Vec::new());
    let mut entries = vec![
        (".BIT.START".to_owned(), br#"{"schema":"1.0.0","scopeName":"remote.scope"}"#.to_vec()),
        ("a".repeat(40), b"compressed".to_vec()),
    ];
    if end {
        entries.push((".BIT.END".into(), br#"{"numOfFiles":1}"#.to_vec()));
    }
    for (name, body) in entries {
        let mut header = tar::Header::new_gnu();
        header.set_size(body.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        tar.append_data(&mut header, name, body.as_slice()).unwrap();
    }
    tar.into_inner().unwrap()
}
fn request(socket: &TcpStream) {
    let mut reader = BufReader::new(socket.try_clone().unwrap());
    let mut length = 0usize;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        if line == "\r\n" {
            break;
        }
        if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
            length = value.trim().parse().unwrap();
        }
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body).unwrap();
}
fn serve(body: Vec<u8>, cancellation: Option<Cancellation>) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let worker = thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        request(&socket);
        write!(
            socket,
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len(),
        )
        .unwrap();
        if let Some(cancellation) = cancellation {
            socket.write_all(&body[..700]).unwrap();
            cancellation.cancel();
            // A cancelled response can close with FIN or reset unread response data.
            match socket.read(&mut [0; 1]) {
                Ok(0) => {}
                Err(error) if error.kind() == std::io::ErrorKind::ConnectionReset => {}
                result => panic!("cancelled fetch did not close its socket: {result:?}"),
            }
        } else {
            for chunk in body.chunks(31) {
                socket.write_all(chunk).unwrap();
            }
        }
    });
    (url, worker)
}
#[test]
fn fragmented_response_is_parsed_incrementally_and_truncation_discards_all_objects() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let network = Network::new(&GlobalConfig::new(), "2.2.94", None, None).unwrap();
    for complete in [true, false] {
        let (url, server) = serve(archive(complete), None);
        let result = runtime.block_on(network.fetch(
            &url,
            &["remote.scope/component@latest".into()],
            &FetchOptions::without_dependencies(None),
        ));
        if complete {
            let items = result.unwrap();
            assert_eq!(items.len(), 1);
            assert_eq!(items[0].compressed, b"compressed");
        } else {
            assert!(
                result
                    .unwrap_err()
                    .to_string()
                    .starts_with("server terminated the stream unexpectedly"),
            );
        }
        server.join().unwrap();
    }
}
#[test]
fn cancelling_an_incomplete_fetch_closes_the_socket_without_waiting_for_server_eof() {
    let cancellation = Cancellation::new();
    let (url, server) = serve(archive(true), Some(cancellation.clone()));
    let network = Network::new(&GlobalConfig::new(), "2.2.94", None, None)
        .unwrap()
        .with_cancellation(cancellation);
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    let result =
        runtime.block_on(network.fetch(&url, &[], &FetchOptions::without_dependencies(None)));
    assert_eq!(result.unwrap_err().kind(), std::io::ErrorKind::Interrupted);
    server.join().unwrap();
}
