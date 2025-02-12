"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelativeComponentsAuthored = void 0;
const legacy_bit_id_1 = require("@teambit/legacy-bit-id");
const component_issue_1 = require("./component-issue");
class RelativeComponentsAuthored extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'components with relative import statements found';
        this.solution = 'replace to module paths or use "bit link --rewire" to replace';
        this.data = {};
        this.isCacheBlocker = false;
        this.formatDataFunction = relativeComponentsAuthoredIssuesToString;
    }
    deserialize(dataStr) {
        const data = JSON.parse(dataStr);
        Object.keys(data).forEach((fileName) => {
            data[fileName] = data[fileName].map((record) => ({
                importSource: record.importSource,
                componentId: new legacy_bit_id_1.BitId(record.componentId),
                relativePath: record.relativePath,
            }));
        });
        return data;
    }
}
exports.RelativeComponentsAuthored = RelativeComponentsAuthored;
function relativeComponentsAuthoredIssuesToString(relativeEntries) {
    const stringifyEntry = (entry) => `"${entry.importSource}" (${entry.componentId.toString()})`;
    return relativeEntries.map(stringifyEntry).join(', ');
}
//# sourceMappingURL=relative-components-authored.js.map