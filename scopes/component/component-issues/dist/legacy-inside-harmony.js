"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyInsideHarmony = void 0;
const component_issue_1 = require("./component-issue");
class LegacyInsideHarmony extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'legacy component inside Harmony workspace';
        this.solution = 'remove the component and re-create it via Harmony';
        this.isTagBlocker = true;
    }
    outputForCLI() {
        return (0, component_issue_1.formatTitle)(this.descriptionWithSolution, false);
    }
}
exports.LegacyInsideHarmony = LegacyInsideHarmony;
//# sourceMappingURL=legacy-inside-harmony.js.map