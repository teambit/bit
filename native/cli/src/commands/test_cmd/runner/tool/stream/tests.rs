use super::accept;
use std::{
    io::{BufRead, Write},
    net::{TcpListener, TcpStream},
    process::{Command, Stdio},
    thread,
    time::Duration,
};

#[test]
fn accepted_control_waits_for_delayed_messages() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let mut client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
    let sender = thread::spawn(move || {
        client.write_all(b"{\"token\":\"test\"}\n").unwrap();
        thread::sleep(Duration::from_millis(100));
        client.write_all(b"ready\n").unwrap();
    });
    let mut child = Command::new(std::env::current_exe().unwrap())
        .arg("--list")
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    let mut control = accept(&listener, &mut child, "test").unwrap();
    control
        .get_ref()
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    let mut message = String::new();
    control.read_line(&mut message).unwrap();
    assert_eq!(message, "ready\n");
    sender.join().unwrap();
    child.wait().unwrap();
}
