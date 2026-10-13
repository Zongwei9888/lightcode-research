import { testReportFilter as filter } from "../filters/test-report.js";
export function project(input) {
    if (input.kind !== 'shell')
        return null;
    return filter.projectMapped({ command: input.command, stdout: input.raw, exitCode: input.exitCode, options: input.options });
}
