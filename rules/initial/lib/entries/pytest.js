import { pytestFilter as filter } from "../filters/pytest.js";
export function project(input) {
    if (input.kind !== 'shell')
        return null;
    return filter.projectMapped({ command: input.command, stdout: input.raw, exitCode: input.exitCode, options: input.options });
}
