//! An offline HTTP proxy serving the real published BVM catalog request.
use std::{
    io::{self, Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};
pub(super) struct Proxy {
    pub url: String,
    address: std::net::SocketAddr,
    stopped: Arc<AtomicBool>,
    requests: Arc<AtomicUsize>,
    worker: Option<JoinHandle<io::Result<()>>>,
}
impl Proxy {
    pub fn new() -> Self {
        Self::catalog(br#"[{"version":"99.0.0","stable":true,"date":"2026-01-01"}]"#)
    }
    pub fn empty() -> Self {
        Self::catalog(b"[]")
    }
    fn catalog(body: &'static [u8]) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let stopped = Arc::new(AtomicBool::new(false));
        let requests = Arc::new(AtomicUsize::new(0));
        let stop = Arc::clone(&stopped);
        let count = Arc::clone(&requests);
        let worker = thread::spawn(move || serve(&listener, &stop, &count, body));
        Self { url: format!("http://{address}"), address, stopped, requests, worker: Some(worker) }
    }
    pub fn requests(&self) -> usize {
        self.requests.load(Ordering::Acquire)
    }
}
impl Drop for Proxy {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        let _wake = TcpStream::connect(self.address);
        if let Some(worker) = self.worker.take() {
            let result = worker.join();
            if !thread::panicking() {
                result.expect("catalog proxy worker panicked").expect("catalog proxy failed");
            }
        }
    }
}
fn serve(
    listener: &TcpListener,
    stopped: &AtomicBool,
    count: &AtomicUsize,
    body: &[u8],
) -> io::Result<()> {
    loop {
        let (mut socket, _) = listener.accept()?;
        if stopped.load(Ordering::Acquire) {
            return Ok(());
        }
        socket.set_nonblocking(false)?;
        socket.set_read_timeout(Some(Duration::from_secs(10)))?;
        let request = headers(&mut socket)?;
        if request.is_empty() {
            continue;
        }
        if !request.starts_with("CONNECT bvm.bit.dev:443 HTTP/1.1\r\n") {
            return Err(io::Error::other("unexpected BVM catalog request"));
        }
        // The published proxy agent replays non-200 responses to node-fetch,
        // and BVM parses their JSON without checking the HTTP status.
        let header = format!(
            "HTTP/1.1 502 Fixture\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len(),
        );
        // The published proxy agent replays only the bytes buffered when
        // the headers arrive. Deliver the small catalog in the same write.
        let mut response = header.into_bytes();
        response.extend_from_slice(body);
        socket.write_all(&response)?;
        count.fetch_add(1, Ordering::Release);
    }
}
fn headers(socket: &mut TcpStream) -> io::Result<String> {
    let mut bytes = Vec::new();
    while !bytes.ends_with(b"\r\n\r\n") {
        let mut byte = [0];
        if socket.read(&mut byte)? == 0 {
            break;
        }
        bytes.push(byte[0]);
        if bytes.len() > 16384 {
            return Err(io::Error::other("oversized proxy headers"));
        }
    }
    String::from_utf8(bytes).map_err(io::Error::other)
}
