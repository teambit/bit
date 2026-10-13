use super::{
    Request,
    wire::{unversioned, version},
};
use std::collections::{HashMap, HashSet};

/// Build once per calculation; dependency aliases still resolve in their original order.
pub(super) struct Index<'a> {
    pub(super) request: &'a Request,
    pub(super) bitmap: HashMap<&'a str, Option<&'a str>>,
    pub(super) lane: HashMap<&'a str, &'a str>,
    pub(super) model: HashMap<&'a str, &'a str>,
    pub(super) env: HashSet<&'a str>,
}
impl<'a> Index<'a> {
    pub(super) fn new(request: &'a Request) -> Self {
        let mut bitmap = HashMap::new();
        for id in &request.sources.bitmap {
            bitmap
                .entry(unversioned(id))
                .and_modify(|value| *value = None)
                .or_insert_with(|| Some(version(id)));
        }
        Self {
            request,
            bitmap,
            lane: first(&request.sources.lane),
            model: first(&request.sources.model),
            env: request.policy.env_own
                .iter()
                .map(String::as_str)
                .collect(),
        }
    }
}
fn first(ids: &[String]) -> HashMap<&str, &str> {
    let mut index = HashMap::new();
    for id in ids {
        index
            .entry(unversioned(id))
            .or_insert_with(|| version(id));
    }
    index
}
