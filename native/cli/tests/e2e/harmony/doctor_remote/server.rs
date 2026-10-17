//! Capture the published GraphQL request body and semantic HTTP headers.
use serde_json::Value;
use std::{
    collections::BTreeMap,
    io::{self, BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    sync::mpsc,
    thread,
    time::Duration,
};
#[derive(Debug)]
pub(super) struct Request {
    pub body: Value,
    pub headers: BTreeMap<String, String>,
}
impl Request {
    pub fn semantic_headers(&self) -> BTreeMap<String, String> {
        self.headers
            .iter()
            .filter(|(key, _)| {
                key.starts_with("x-")
                    || key.as_str() == "authorization"
                    || key.as_str() == "content-type"
            })
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect()
    }
}
pub(super) struct Server {
    pub url: String,
    pub requests: mpsc::Receiver<Request>,
    thread: Option<thread::JoinHandle<io::Result<()>>>,
}
impl Server {
    pub fn new(response: &Value) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let (sent, requests) = mpsc::channel();
        let body = response.to_string();
        let thread = thread::spawn(move || serve(&listener, &sent, &body));
        Self { url, requests, thread: Some(thread) }
    }
    pub fn finish(mut self) {
        self.thread
            .take()
            .unwrap()
            .join()
            .unwrap()
            .unwrap();
    }
}
fn serve(listener: &TcpListener, sent: &mpsc::Sender<Request>, body: &str) -> io::Result<()> {
    for _ in 0..2 {
        let (mut socket, _) = listener.accept()?;
        socket.set_nonblocking(false)?;
        socket.set_read_timeout(Some(Duration::from_secs(20)))?;
        let request = request(&socket)?;
        sent.send(request).map_err(io::Error::other)?;
        write!(
            socket,
            "HTTP/1.1 200 OK\r\n\
            Content-Type: application/json\r\n\
            Content-Length: {}\r\n\
            Connection: close\r\n\
            \r\n\
            {body}",
            body.len(),
        )?;
    }
    Ok(())
}
fn request(socket: &TcpStream) -> io::Result<Request> {
    let mut reader = BufReader::new(socket.try_clone()?);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    if line != "POST /graphql HTTP/1.1\r\n" {
        return Err(io::Error::other("unexpected doctor request target"));
    }
    let headers = headers(&mut reader)?;
    let length = headers
        .get("content-length")
        .ok_or_else(|| io::Error::other("missing request size"))?
        .parse::<usize>()
        .map_err(io::Error::other)?;
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let body = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
    Ok(Request { body, headers })
}
fn headers(reader: &mut BufReader<TcpStream>) -> io::Result<BTreeMap<String, String>> {
    let mut headers = BTreeMap::new();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 {
            return Err(io::Error::other("unexpected request EOF"));
        }
        if line == "\r\n" {
            return Ok(headers);
        }
        let (key, value) =
            line.split_once(':').ok_or_else(|| io::Error::other("invalid header"))?;
        headers.insert(key.to_ascii_lowercase(), value.trim().to_owned());
    }
}
