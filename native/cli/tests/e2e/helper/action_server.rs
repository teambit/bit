//! A recording HTTP action endpoint for released/native protocol comparisons.
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    thread,
    time::{Duration, Instant},
};

#[derive(Debug, PartialEq, Eq)]
pub struct Request {
    pub path: String,
    pub body: Value,
}

pub struct Server {
    pub url: String,
    worker: thread::JoinHandle<Vec<Request>>,
}

impl Server {
    pub fn start(
        count: usize,
        mut answer: impl FnMut(&Request) -> (u16, Value) + Send + 'static,
    ) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let worker = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(90);
            let mut requests = Vec::new();
            while requests.len() < count && Instant::now() < deadline {
                match listener.accept() {
                    Ok((stream, _)) => requests.push(exchange(stream, &mut answer)),
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(error) => panic!("action fixture: {error}"),
                }
            }
            assert_eq!(requests.len(), count, "unexpected number of action requests");
            requests
        });
        Self { url, worker }
    }

    pub fn finish(self) -> Vec<Request> {
        self.worker.join().unwrap()
    }
}

fn exchange(mut stream: TcpStream, answer: &mut impl FnMut(&Request) -> (u16, Value)) -> Request {
    stream.set_nonblocking(false).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .unwrap();
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut first = String::new();
    reader.read_line(&mut first).unwrap();
    let mut words = first.split_whitespace();
    assert_eq!(words.next(), Some("POST"));
    let path = words.next().unwrap().to_owned();
    let mut length = None;
    loop {
        let mut line = String::new();
        assert!(reader.read_line(&mut line).unwrap() > 0);
        if line == "\r\n" {
            break;
        }
        if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
            length = Some(value.trim().parse::<usize>().unwrap());
        }
    }
    let mut bytes = vec![0; length.unwrap()];
    reader.read_exact(&mut bytes).unwrap();
    let request = Request { path, body: serde_json::from_slice(&bytes).unwrap() };
    let (status, response) = answer(&request);
    let response = response.to_string();
    write!(
        stream,
        "HTTP/1.1 {status} Response\r\n\
        Content-Type: application/json\r\n\
        Content-Length: {}\r\n\
        Connection: close\r\n\
        \r\n\
        {response}",
        response.len(),
    )
    .unwrap();
    request
}
