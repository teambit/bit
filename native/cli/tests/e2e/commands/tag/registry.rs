//! Real registry facts leave semantic version planning and writes in Rust.

use super::soft::{bitmap, compare_command};
use crate::helper::{FOO_FIXTURE, Helper, config};
use std::{
    ffi::OsStr,
    io::{self, Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

struct Registry {
    url: String,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Registry {
    fn new(always_taken: bool) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = Arc::clone(&stop);
        let thread = thread::spawn(move || serve(&listener, &stopping, always_taken));
        Self { url, stop, thread: Some(thread) }
    }
}

impl Drop for Registry {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Err(panic) = self.thread.take().unwrap().join()
            && !thread::panicking()
        {
            std::panic::resume_unwind(panic);
        }
    }
}

fn serve(listener: &TcpListener, stop: &AtomicBool, always_taken: bool) {
    while !stop.load(Ordering::Relaxed) {
        if let Ok((mut connection, _)) = listener.accept() {
            // npm may cancel a request before sending headers or reading its response.
            let _ = respond(&mut connection, always_taken);
        } else {
            thread::sleep(Duration::from_millis(5));
        }
    }
}

fn respond(connection: &mut TcpStream, always_taken: bool) -> io::Result<()> {
    // Windows accepted sockets inherit the listener's nonblocking mode.
    connection.set_nonblocking(false)?;
    connection.set_read_timeout(Some(Duration::from_secs(2)))?;
    let mut buffer = [0; 8192];
    let length = connection.read(&mut buffer)?;
    if length == 0 {
        return Ok(());
    }
    let request = String::from_utf8_lossy(&buffer[..length]);
    let taken = always_taken
        || request
            .lines()
            .next()
            .unwrap_or_default()
            .contains("/0.0.2 ");
    let status = if taken { "200 OK" } else { "404 Not Found" };
    write!(connection, "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
}

fn workspace(registry: &Registry) -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    let path = helper.scopes.local_path.join(".bitmap");
    let mut components = config::read_jsonc(&path);
    components["bar/foo"]["config"]["teambit.pkg/pkg"] = serde_json::json!({"packageJson":{"name":"@registry-test/{name}","publishConfig":{"registry":registry.url}}});
    config::write_json(&path, &components, b"  ");
    let initial = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "tag --message initial",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(initial.status.success(), "{}", initial.stderr);
    helper.append_file("bar/foo.js", "\n// registry retry");
    helper
}

#[test]
fn skip_published_versions_uses_registry_facts_and_native_allocation() {
    let registry = Registry::new(false);
    let helper = workspace(&registry);
    let node_workspace = helper.clone_workspace();
    compare_command(&helper, &node_workspace, "tag --skip-published-versions --message retry");
    assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["version"], "0.0.3");
}

#[test]
fn published_version_limit_fails_without_allocating_a_version() {
    let registry = Registry::new(true);
    let helper = workspace(&registry);
    let before = bitmap(&helper.scopes.local_path);
    let node_workspace = helper.clone_workspace();
    compare_command(&helper, &node_workspace, "tag --skip-published-versions --message retry");
    assert_eq!(bitmap(&helper.scopes.local_path), before);
}

#[test]
fn explicitly_chosen_versions_do_not_query_the_registry() {
    let registry = Registry::new(true);
    let helper = workspace(&registry);
    let node_workspace = helper.clone_workspace();
    compare_command(
        &helper,
        &node_workspace,
        "tag --skip-published-versions --ver 2.0.0 --message explicit",
    );
    assert_eq!(bitmap(&helper.scopes.local_path)["bar/foo"]["version"], "2.0.0");
}

#[test]
fn registry_handles_disconnected_clients_and_delayed_request_headers() {
    let registry = Registry::new(false);
    let address = registry.url.strip_prefix("http://").unwrap();
    drop(TcpStream::connect(address).unwrap());
    let mut connection = TcpStream::connect(address).unwrap();
    connection
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    connection.write_all(b"GET /package/0.0.3 HTTP/1.1\r\nHost: localhost\r\n\r\n").unwrap();
    let mut response = String::new();
    connection.read_to_string(&mut response).unwrap();
    assert!(response.starts_with("HTTP/1.1 404 Not Found"), "{response}");
}

#[test]
fn accepted_nonblocking_streams_wait_for_request_headers() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (ready, accepted) = std::sync::mpsc::channel();
    let worker = thread::spawn(move || {
        let (mut connection, _) = listener.accept().unwrap();
        connection.set_nonblocking(true).unwrap();
        ready.send(()).unwrap();
        respond(&mut connection, false).unwrap();
    });
    let mut connection = TcpStream::connect(address).unwrap();
    accepted
        .recv_timeout(Duration::from_secs(3))
        .unwrap();
    thread::sleep(Duration::from_millis(30));
    connection
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    connection.write_all(b"GET /package/0.0.3 HTTP/1.1\r\nHost: localhost\r\n\r\n").unwrap();
    let mut response = String::new();
    connection.read_to_string(&mut response).unwrap();
    worker.join().unwrap();
    assert!(response.starts_with("HTTP/1.1 404 Not Found"), "{response}");
}
