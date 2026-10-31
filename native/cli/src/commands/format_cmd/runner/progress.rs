//! Formatter component-loading and per-component progress in released order.
pub(super) use crate::commands::workspace_command::component_service::Progress;
use bit_install::output::Output;
impl Progress {
    pub fn print(&self, output: &Output) {
        self.start(output);
        for index in 0..self.identities.len() {
            self.component(output, index);
        }
    }
    pub fn start(&self, output: &Output) {
        for count in &self.loads {
            if *count > 0 {
                output.status(&format!("loading {count} component(s)"));
            }
        }
        if self.identities.is_empty() {
            return;
        }
        output.status(&format!("formatting components (total: {})", self.identities.len()));
    }
    pub fn component(&self, output: &Output, index: usize) {
        let Some(identity) = self.identities.get(index) else {
            return;
        };
        output.status(&format!(
            "formatting components ({}/{}) {identity}",
            index + 1,
            self.identities.len(),
        ));
    }
}
