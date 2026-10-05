/**
 * Turns a stream of text deltas into whole sentences so each one can be checked
 * before the child sees it. A boundary is end punctuation followed by whitespace,
 * or a newline. Very long runs are cut at the last space to bound latency.
 */
export class SentenceBuffer {
  private pending = '';

  constructor(private readonly maxLength = 280) {}

  push(delta: string): string[] {
    this.pending += delta;
    const out: string[] = [];

    for (;;) {
      const boundary = this.findBoundary();
      if (boundary === -1) break;
      const sentence = this.pending.slice(0, boundary).trim();
      this.pending = this.pending.slice(boundary).replace(/^\s+/, '');
      if (sentence) out.push(sentence);
    }

    while (this.pending.length > this.maxLength) {
      const cut = this.pending.lastIndexOf(' ', this.maxLength);
      const at = cut > 0 ? cut : this.maxLength;
      const piece = this.pending.slice(0, at).trim();
      this.pending = this.pending.slice(at).replace(/^\s+/, '');
      if (piece) out.push(piece);
    }

    return out;
  }

  /** Whatever is left when the stream ends. */
  flush(): string[] {
    const rest = this.pending.trim();
    this.pending = '';
    return rest ? [rest] : [];
  }

  private findBoundary(): number {
    const newline = this.pending.indexOf('\n');
    const punct = /[.!?…]+["'”׳״)]*\s/.exec(this.pending);
    const punctEnd = punct ? punct.index + punct[0].length - 1 : -1;
    if (newline === -1) return punctEnd;
    if (punctEnd === -1) return newline + 1;
    return Math.min(newline + 1, punctEnd);
  }
}
