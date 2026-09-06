// Keyword extraction and matching for recall. No stemming or embeddings:
// lowercase alphanumeric tokens of 3+ chars, minus common stopwords.

const STOPWORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was', 'one', 'our',
    'out', 'has', 'him', 'his', 'how', 'its', 'may', 'now', 'see', 'who', 'did', 'get', 'let', 'say', 'she',
    'too', 'use', 'that', 'with', 'have', 'this', 'will', 'your', 'from', 'they', 'know', 'want', 'been',
    'were', 'what', 'when', 'where', 'which', 'there', 'their', 'them', 'then', 'than', 'these', 'those',
    'would', 'could', 'should', 'about', 'into', 'over', 'also', 'just', 'like', 'some', 'such', 'very',
    'does', 'done', 'each', 'more', 'most', 'much', 'only', 'other', 'same', 'here', 'well', 'being',
]);

export const MAX_TOKENS = 64;

/** Distinct keywords of a text, in first-seen order, at most MAX_TOKENS. */
export function tokenize(text: string): string[] {
    const seen = new Set<string>();
    for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
        if (raw.length < 3 || STOPWORDS.has(raw)) continue;
        seen.add(raw.slice(0, 40));
        if (seen.size >= MAX_TOKENS) break;
    }
    return [...seen];
}

/** Stored form: " a b c " (padded so every token is space-delimited). */
export function keywordString(tokens: string[]): string {
    return tokens.length ? ` ${tokens.join(' ')} ` : ' ';
}

/**
 * Regex matching a keyword string that contains any of `tokens`. Tokens are
 * [a-z0-9] only, so nothing needs escaping. PlugPort ignores $regex patterns
 * longer than 500 chars, so tokens are dropped past a 480-char budget.
 */
export function keywordPattern(tokens: string[]): string | null {
    const kept: string[] = [];
    let length = ' (?:) '.length;
    for (const t of tokens) {
        const add = t.length + (kept.length ? 1 : 0);
        if (length + add > 480) break;
        kept.push(t);
        length += add;
    }
    return kept.length ? ` (?:${kept.join('|')}) ` : null;
}

/** How many of `tokens` appear in a stored keyword string. */
export function keywordHits(keywords: string, tokens: string[]): number {
    let hits = 0;
    for (const t of tokens) if (keywords.includes(` ${t} `)) hits++;
    return hits;
}

/** Escape a string for use inside a regular expression. */
export function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
