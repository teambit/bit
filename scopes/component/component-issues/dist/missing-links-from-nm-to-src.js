"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingLinksFromNodeModulesToSrc = void 0;
const component_issue_1 = require("./component-issue");
class MissingLinksFromNodeModulesToSrc extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'missing links from node_modules to source';
        this.solution = 'run "bit link"';
        this.isTagBlocker = false;
    }
    outputForCLI() {
        return (0, component_issue_1.formatTitle)(this.descriptionWithSolution, false);
    }
}
exports.MissingLinksFromNodeModulesToSrc = MissingLinksFromNodeModulesToSrc;
//# sourceMappingURL=missing-links-from-nm-to-src.js.map