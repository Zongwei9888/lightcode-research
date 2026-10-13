import { goTestJsonFilter as filter } from "../filters/go-test-json.js";
export function project(input) {
    if (input.kind !== 'shell')
        return null;
    return filter.projectMapped({ command: input.command, stdout: input.raw, exitCode: input.exitCode, options: input.options });
}
