/** Complement of copied source ranges; absence is NOT a claim that evidence is dispensable. */
export function omittedSourceRanges(map) {
    const kept = map.spans.filter(span => span.sourceStart !== undefined && span.sourceEnd !== undefined)
        .map(span => ({ start: span.sourceStart, end: span.sourceEnd }))
        .sort((a, b) => a.start - b.start);
    const omitted = [];
    let end = 0;
    for (const span of kept) {
        if (span.start > end)
            omitted.push({ start: end, end: span.start });
        end = Math.max(end, span.end);
    }
    if (end < map.sourceLength)
        omitted.push({ start: end, end: map.sourceLength });
    return omitted;
}
/** Split without normalizing CRLF, indentation, or the final newline. */
export function sourceLines(raw) {
    const result = [];
    let start = 0;
    while (start < raw.length) {
        const newline = raw.indexOf('\n', start);
        const end = newline < 0 ? raw.length : newline + 1;
        result.push({ text: raw.slice(start, end).replace(/\r?\n$/, ''), start, end });
        start = end;
    }
    return result;
}
/** Build text and copy ranges together, without retrospective line matching. */
export class ProjectionBuilder {
    raw;
    text = '';
    spans = [];
    constructor(raw) {
        this.raw = raw;
    }
    keep(start, end) {
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > this.raw.length) {
            throw new RangeError('invalid Economy source range');
        }
        if (end === start)
            return;
        const outputStart = this.text.length;
        this.text += this.raw.slice(start, end);
        this.spans.push({ outputStart, outputEnd: this.text.length, sourceStart: start, sourceEnd: end });
    }
    generate(text, reason) {
        if (text === '')
            return;
        const outputStart = this.text.length;
        this.text += text;
        this.spans.push({ outputStart, outputEnd: this.text.length, generated: reason });
    }
    append(projection, start = 0, end = projection.text.length) {
        for (const span of projection.sourceMap.spans) {
            const from = Math.max(start, span.outputStart);
            const to = Math.min(end, span.outputEnd);
            if (from >= to)
                continue;
            if (span.sourceStart !== undefined && span.sourceEnd !== undefined) {
                this.keep(span.sourceStart + from - span.outputStart, span.sourceStart + to - span.outputStart);
            }
            else
                this.generate(projection.text.slice(from, to), span.generated ?? 'projection');
        }
    }
    newline() {
        if (this.text !== '' && !this.text.endsWith('\n'))
            this.generate('\n', 'separator');
    }
    finish() {
        return {
            text: this.text,
            sourceMap: { version: 1, unit: 'utf16', sourceLength: this.raw.length, outputLength: this.text.length, spans: [...this.spans] },
        };
    }
}
