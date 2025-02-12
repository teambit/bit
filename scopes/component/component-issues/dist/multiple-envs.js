"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultipleEnvs = void 0;
const component_issue_1 = require("./component-issue");
class MultipleEnvs extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'multiple envs';
        this.solution = 'set the desired env by running "bit env set <component> <env>", if it doesn\'t work, run "bit aspect unset <component> <unwanted-env-id>". to keep troubleshooting run "bit aspect list <component-id>"';
        this.isTagBlocker = true;
    }
    dataToString() {
        return component_issue_1.ISSUE_FORMAT_SPACE + this.data.join(', ');
    }
}
exports.MultipleEnvs = MultipleEnvs;
//# sourceMappingURL=multiple-envs.js.map