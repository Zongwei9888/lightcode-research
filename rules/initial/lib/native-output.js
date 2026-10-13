import { ProjectionBuilder } from "./projection-map.js";
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Verify the entire native rendering before changing its layout; never trim a host preview. */
export function nativeSearchProjection(name, value, raw) {
    if (!record(value))
        return undefined;
    const builder = new ProjectionBuilder(raw);
    if (name === 'grep') {
        if (!Array.isArray(value.matches) || value.matches.length === 0)
            return undefined;
        const groups = new Map();
        for (const match of value.matches) {
            if (!record(match) || typeof match.path !== 'string' || /[\r\n\0]/.test(match.path)
                || typeof match.line !== 'string' || /[\r\n\0]/.test(match.line)
                || !Number.isSafeInteger(match.lineNumber) || Number(match.lineNumber) < 1)
                return undefined;
            const group = groups.get(match.path) ?? [];
            group.push({ lineNumber: Number(match.lineNumber), line: match.line });
            groups.set(match.path, group);
        }
        const header = `Found ${value.matches.length} ${value.matches.length === 1 ? 'match' : 'matches'}\n\n`;
        const full = header + [...groups].map(([path, matches]) => `${path}\n${matches.map(m => `Line ${m.lineNumber}: ${m.line}`).join('\n')}`).join('\n\n');
        if (raw !== full)
            return undefined;
        let offset = header.length;
        builder.keep(0, offset);
        for (const [path, matches] of groups) {
            builder.keep(offset, offset + path.length + 1);
            offset += path.length + 1;
            for (const match of matches) {
                const length = `Line ${match.lineNumber}: ${match.line}`.length;
                builder.keep(offset + 5, offset + length);
                offset += length;
                if (raw[offset] === '\n') {
                    builder.keep(offset, offset + 1);
                    offset += 1;
                }
            }
            if (raw[offset] === '\n') {
                builder.keep(offset, offset + 1);
                offset += 1;
            }
        }
        return { ...builder.finish(), filter: 'native-grep', transformation: 'lossless-formatting' };
    }
    if (name !== 'glob' || !Array.isArray(value.paths) || value.paths.length === 0
        || !value.paths.every(path => typeof path === 'string' && path !== '' && !/[\r\n\0]/.test(path))
        || raw !== value.paths.join('\n'))
        return undefined;
    // Consecutive paths only: grouping never changes the modification-time order.
    const paths = value.paths;
    let offset = 0;
    builder.generate('[paths grouped by directory; original order retained]\n', 'glob-layout');
    for (let i = 0; i < paths.length;) {
        const path = paths[i];
        const slash = path.lastIndexOf('/');
        const directory = path.slice(0, slash + 1);
        let end = i + 1;
        while (directory !== '' && end < paths.length && paths[end].slice(0, paths[end].lastIndexOf('/') + 1) === directory)
            end += 1;
        if (directory !== '' && end - i > 1) {
            builder.keep(offset, offset + directory.length);
            builder.generate('\n', 'glob-layout');
            for (; i < end; i += 1) {
                const length = paths[i].length;
                builder.generate('  ', 'glob-layout');
                builder.keep(offset + directory.length, offset + length);
                builder.generate('\n', 'glob-layout');
                offset += length + (i < paths.length - 1 ? 1 : 0);
            }
        }
        else {
            builder.keep(offset, offset + path.length);
            builder.generate('\n', 'glob-layout');
            offset += path.length + (i < paths.length - 1 ? 1 : 0);
            i += 1;
        }
    }
    return { ...builder.finish(), filter: 'native-glob', transformation: 'lossless-formatting' };
}
/** Strings from the persistent-shell contract carry a terminal marker instead of structured status. */
export function persistentOutput(value, raw) {
    if (typeof value !== 'string' || value !== raw || /response clipped|shell was reset|shell exited|timed out|killed by signal|\u001b|\0/i.test(raw))
        return undefined;
    const marker = /\n\[exit code: (\d+)\]$/.exec(raw);
    return { text: marker === null ? raw : raw.slice(0, marker.index), exitCode: Number(marker?.[1] ?? 0) };
}
export function finishedJobOutput(value, raw, jobId, command) {
    if (!record(value) || typeof value.text !== 'string' || !record(value.job))
        return undefined;
    const job = value.job;
    if (job.id !== jobId || job.kind !== 'bash' || job.label !== command
        || job.status !== 'completed' || typeof job.detail !== 'string'
        || /dropped from memory|output truncated|result truncated|sandbox:|\u001b|\0/.test(value.text))
        return undefined;
    const exit = /^exit code: (\d+)$/.exec(job.detail);
    if (exit === null)
        return undefined;
    const exitCode = Number(exit[1]);
    const status = `[status: ${job.status}, ${job.detail}]`;
    if (raw !== value.text + (value.text.endsWith('\n') ? '' : '\n') + status)
        return undefined;
    return { text: value.text, exitCode };
}
