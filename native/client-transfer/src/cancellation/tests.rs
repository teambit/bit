use super::Cancellation;
use std::{future, io};
#[test]
fn cancelled_operations_never_poll_the_transport() {
    let cancellation = Cancellation::new();
    cancellation.cancel();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let error = runtime
        .block_on(cancellation.run(future::poll_fn(|_| -> std::task::Poll<()> {
            panic!("cancelled transport polled")
        })))
        .unwrap_err();
    assert_eq!(error.kind(), io::ErrorKind::Interrupted);
}
#[test]
fn cancellation_wakes_an_already_pending_operation() {
    let cancellation = Cancellation::new();
    let worker = cancellation.clone();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let (ready, started) = std::sync::mpsc::channel();
    let task = std::thread::spawn(move || {
        runtime.block_on(worker.run(async {
            ready.send(()).unwrap();
            future::pending::<()>().await;
        }))
    });
    started.recv().unwrap();
    cancellation.cancel();
    assert_eq!(task.join().unwrap().unwrap_err().kind(), io::ErrorKind::Interrupted);
}

#[test]
fn construction_scope_restores_nested_owners_after_a_panic() {
    let outer = Cancellation::new();
    let inner = Cancellation::new();
    Cancellation::scope(&outer, || {
        let captured = Cancellation::current();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            Cancellation::scope(&inner, || panic!("restore owner"));
        }));
        assert!(result.is_err());
        inner.cancel();
        assert!(!Cancellation::current().is_cancelled());
        outer.cancel();
        assert!(captured.is_cancelled());
        assert!(Cancellation::current().is_cancelled());
    });
    assert!(!Cancellation::current().is_cancelled());
}
