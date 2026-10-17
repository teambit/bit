use super::{GlobalConfig, Network};
use serde_json::json;
use std::{
    io::{ErrorKind, Read},
    net::TcpListener,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

#[test]
fn failed_upload_is_not_replayed_even_when_fetch_retries_are_enabled() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    listener.set_nonblocking(true).unwrap();
    let (finished, stop) = mpsc::channel();
    let server = disconnecting_server(listener, stop);
    let global = GlobalConfig::from_iter([
        ("network.fetch_retries".into(), json!(2)),
        ("network.fetch_retry_mintimeout".into(), json!(1)),
        ("network.fetch_retry_maxtimeout".into(), json!(1)),
    ]);
    let network = Network::new(&global, "2.2.94", None, None).unwrap();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    assert!(
        runtime
            .block_on(network.push(&url, "client", vec![0; 1024]))
            .is_err(),
    );
    finished.send(()).unwrap();
    assert_eq!(server.join().unwrap(), 1);
}

fn disconnecting_server(
    listener: TcpListener,
    stop: mpsc::Receiver<()>,
) -> thread::JoinHandle<usize> {
    thread::spawn(move || {
        let mut count = 0;
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            match listener.accept() {
                Ok((mut socket, _)) => {
                    socket.set_nonblocking(false).unwrap();
                    socket
                        .set_read_timeout(Some(Duration::from_secs(5)))
                        .unwrap();
                    assert!(socket.read(&mut [0; 4096]).unwrap() > 0);
                    count += 1;
                }
                Err(error) if error.kind() == ErrorKind::WouldBlock && stop.try_recv().is_ok() => {
                    break count;
                }
                Err(error) if error.kind() == ErrorKind::WouldBlock => {
                    assert!(Instant::now() < deadline, "upload did not finish");
                    thread::sleep(Duration::from_millis(1));
                }
                Err(error) => panic!("{error}"),
            }
        }
    })
}
