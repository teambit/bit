//! Formatter component-loading and per-component progress in released order.
use bit_install::output::Output;

pub(super) struct Progress {
    pub name: String,
    pub identities: Vec<String>,
    pub loads: Vec<usize>,
}
impl Progress {
    pub fn print(&self, output: &Output) {
        for count in &self.loads {
            if *count > 0 {
                output.status(&format!("loading {count} component(s)"));
            }
        }
        if self.identities.is_empty() {
            return;
        }
        output.status(&format!("formatting components (total: {})", self.identities.len()));
        for (index, id) in self.identities.iter().enumerate() {
            output.status(&format!(
                "formatting components ({}/{}) {id}",
                index + 1,
                self.identities.len(),
            ));
        }
    }
}
