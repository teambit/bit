//! Formatter component-loading and per-component [`Progress`] (`print`, `start`, `component`) on [`Output`] in released order.
pub(super) use crate::commands::workspace_command::component_service::Progress;
use bit_install::output::Output;
impl Progress {
    /// Emits both the initial loading/total status lines ([`Self::start`]) and per-component formatting status lines ([`Self::component`]).
    #[inline]
    pub fn print(&self, output: &Output) {
        self.start(output);
        for index in 0..self.identities.len() {
            self.component(output, index);
        }
    }
    /// Emits component-loading counts and the overall `formatting components (total: N)` status line onto [`Output`].
    #[inline]
    pub fn start(&self, output: &Output) {
        for count in &self.loads {
            if *count > 0 {
                output.status(&format!("loading {count} component(s)"));
            }
        }
        let total = self.non_empty_count();
        if total == 0 {
            return;
        }
        output.status(&format!("formatting components (total: {total})"));
    }
    /// Emits the per-component `formatting components (i/total) <identity>` status line onto [`Output`].
    #[inline]
    pub fn component(&self, output: &Output, index: usize) {
        let Some(identity) = self.identities
            .get(index)
            .map(|id| id.trim())
            .filter(|id| !id.is_empty())
        else {
            return;
        };
        let total = self.non_empty_count().max(index + 1);
        output.status(&format!("formatting components ({}/{total}) {identity}", index + 1));
    }
    /// Returns the number of non-empty component identities in `self.identities` for [`Progress`].
    #[inline]
    fn non_empty_count(&self) -> usize {
        self.identities
            .iter()
            .filter(|id| !id.trim().is_empty())
            .count()
    }
}
