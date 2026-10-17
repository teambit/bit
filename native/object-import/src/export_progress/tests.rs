use super::{Event, emit, scope};
use std::sync::{Arc, Barrier, mpsc::sync_channel};

#[test]
fn nested_observer_unwind_restores_the_outer_operation() {
    let (outer, outer_events) = sync_channel(4);
    let (inner, inner_events) = sync_channel(4);
    scope(&outer, || {
        assert!(emit(Event::Verify));
        let failure = std::panic::catch_unwind(|| scope(&inner, panic_inner));
        assert!(failure.is_err());
        assert!(emit(Event::Verified));
    });
    assert!(!emit(Event::Persist { scope: "outside".to_owned() }));
    assert_eq!(outer_events.try_iter().collect::<Vec<_>>(), [Event::Verify, Event::Verified]);
    assert_eq!(
        inner_events.try_iter().collect::<Vec<_>>(),
        [Event::HubMessage("inner".to_owned())],
    );
}

#[test]
fn concurrent_export_owners_do_not_receive_each_others_events() {
    let barrier = Arc::new(Barrier::new(2));
    let (left, left_events) = sync_channel(1);
    let (right, right_events) = sync_channel(1);
    std::thread::scope(|threads| {
        for (sender, name) in [(left, "left"), (right, "right")] {
            let barrier = Arc::clone(&barrier);
            threads.spawn(move || observe_owner(&sender, &barrier, name));
        }
    });
    assert_eq!(
        left_events.try_iter().collect::<Vec<_>>(),
        [Event::Persist { scope: "left".to_owned() }],
    );
    assert_eq!(
        right_events.try_iter().collect::<Vec<_>>(),
        [Event::Persist { scope: "right".to_owned() }],
    );
}

fn panic_inner() {
    assert!(emit(Event::HubMessage("inner".to_owned())));
    panic!("fixture observer unwind");
}

fn observe_owner(sender: &std::sync::mpsc::SyncSender<Event>, barrier: &Barrier, name: &str) {
    scope(sender, || {
        barrier.wait();
        assert!(emit(Event::Persist { scope: name.to_owned() }));
    });
}
