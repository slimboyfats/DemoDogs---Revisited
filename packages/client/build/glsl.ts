import ts from 'typescript';

/** Does this text read as shader source? (The words no other string in the client is made of.) */
const SHADER =
  /#version 300 es|\bgl_(Position|FragCoord|VertexID|InstanceID|PointSize)\b|\b(uniform|in|out) +(highp +|mediump +|lowp +)?(float|u?int|[iu]?vec[234]|mat[234]|u?sampler2D)\b|\b(float|[iu]?vec[234]|void) +\w+\([^)]*\) *\{/;

/**
 * One piece of a shader with what nobody runs taken out: comments, the indent, blank lines and
 * runs of spaces. Lines stay lines, so `#` lines still stand alone. `first` and `last` say
 * whether the piece starts and ends the whole string (a piece between two `${}` must keep a
 * space at its ends), and `inComment` whether the piece before it ended inside a `//` comment.
 * Returns the text and whether it, too, ends inside one.
 */
export function squeezePiece(
  raw: string,
  first: boolean,
  last: boolean,
  inComment: boolean,
): { text: string; inComment: boolean } {
  let s = raw;
  if (inComment) {
    // the rest of a comment that a `${}` cut in two
    const nl = s.indexOf('\n');
    if (nl < 0) return { text: '', inComment: true };
    s = s.slice(nl);
  }
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  let open = false;
  s = s.replace(/\/\/[^\n]*(\n|$)/g, (_all, end: string) => {
    if (end === '' && !last) {
      // it runs on past the `${}`: what that puts in must stay inside a comment
      open = true;
      return '//';
    }
    return end;
  });
  const lines = s.split('\n').map((l) => l.replace(/[ \t\r]+/g, ' '));
  const n = lines.length;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let l = lines[i]!;
    // the ends of the piece touch a `${}`: a space there may be what parts two words
    const keepHead = i === 0 && !first && !inComment;
    const keepTail = i === n - 1 && !last && !open;
    if (!keepHead) l = l.replace(/^ /, '');
    if (!keepTail) l = l.replace(/ $/, '');
    if (l === '' && i > 0 && i < n - 1) continue;
    out.push(l);
  }
  return { text: out.join('\n'), inComment: open };
}

/**
 * A module's source with every shader in it squeezed (see `squeezePiece`), or null when it has
 * none. Shaders are template strings; anything else is left as written.
 */
export function squeezeGlsl(code: string, file = 'module.ts'): string | null {
  if (!code.includes('`')) return null;
  const src = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const edits: { from: number; to: number; text: string }[] = [];
  /** [from, to) of the text of each piece of a template, inside its quotes and braces. */
  const pieces = (node: ts.TemplateLiteral): [number, number][] => {
    if (ts.isNoSubstitutionTemplateLiteral(node))
      return [[node.getStart(src) + 1, node.getEnd() - 1]];
    const out: [number, number][] = [[node.head.getStart(src) + 1, node.head.getEnd() - 2]];
    for (const span of node.templateSpans) {
      const lit = span.literal;
      const tail = ts.isTemplateTail(lit);
      out.push([lit.getStart(src) + 1, lit.getEnd() - (tail ? 1 : 2)]);
    }
    return out;
  };
  const visit = (node: ts.Node): void => {
    if (
      (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) &&
      !ts.isTaggedTemplateExpression(node.parent)
    ) {
      const ps = pieces(node);
      const whole = ps.map(([a, b]) => code.slice(a, b)).join(' x ');
      if (whole.includes('\n') && SHADER.test(whole)) {
        let inComment = false;
        ps.forEach(([from, to], i) => {
          const got = squeezePiece(code.slice(from, to), i === 0, i === ps.length - 1, inComment);
          inComment = got.inComment;
          if (got.text !== code.slice(from, to)) edits.push({ from, to, text: got.text });
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  if (edits.length === 0) return null;
  edits.sort((a, b) => b.from - a.from);
  let out = code;
  for (const e of edits) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}
