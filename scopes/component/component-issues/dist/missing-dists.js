"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingDists = void 0;
const component_issue_1 = require("./component-issue");
class MissingDists extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'missing dists';
        this.solution = 'run "bit compile"';
        this.isTagBlocker = false;
    }
    outputForCLI() {
        return (0, component_issue_1.formatTitle)(this.descriptionWithSolution, false);
    }
}
exports.MissingDists = MissingDists;
//# sourceMappingURL=missing-dists.js.map