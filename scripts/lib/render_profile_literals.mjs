/**
 * Extract a pure-data `export const NAME = <literal> as const;` declaration from
 * RenderProfile.ts so contract harnesses can stub the REAL value.
 *
 * The harnesses compile a slice of a TypeScript source that starts at a class
 * declaration, so the module's `import` statements are absent and every imported
 * symbol becomes an undefined global at eval time. Stubbing those globals from a
 * hand-copied literal silently drifts from the production constant; reading the
 * literal out of RenderProfile.ts keeps the harness pinned to the one source of
 * truth.
 *
 * Only literals with no `cc` dependency can be extracted this way: the returned
 * text is evaluated as JavaScript, so a `new Vec3(...)` inside it would throw.
 * RenderProfile's composition/shadow constants are pure data, which is why they
 * are extractable.
 */

/** True for the whitespace the marker scan skips between `=` and the literal. */
const isWhitespace = (character) => /\s/.test(character);

const CLOSER_FOR = { '{': '}', '[': ']', '(': ')' };

/**
 * Return the source text of the literal assigned to `export const NAME = ...`.
 * The slice stops at the delimiter that closes the literal, so a trailing
 * `as const;` is excluded and the result is valid JavaScript.
 */
export function extractRenderProfileLiteral(source, name) {
  const marker = `export const ${name} =`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`RenderProfile export not found: ${name}`);

  let index = markerIndex + marker.length;
  while (index < source.length && isWhitespace(source[index])) index += 1;

  const opener = source[index];
  if (!CLOSER_FOR[opener]) {
    throw new Error(`RenderProfile export ${name} does not start with an object/array literal`);
  }

  const start = index;
  const closers = [];
  for (; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    // Comments may contain braces and apostrophes, so skip them wholesale.
    if (character === '/' && next === '/') {
      const newline = source.indexOf('\n', index);
      if (newline < 0) break;
      index = newline;
      continue;
    }
    if (character === '/' && next === '*') {
      const commentEnd = source.indexOf('*/', index);
      if (commentEnd < 0) break;
      index = commentEnd + 1;
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      const quote = character;
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\') index += 1;
        index += 1;
      }
      continue;
    }

    if (CLOSER_FOR[character]) {
      closers.push(CLOSER_FOR[character]);
    } else if (closers.length > 0 && character === closers[closers.length - 1]) {
      closers.pop();
      if (closers.length === 0) break;
    }
  }

  if (closers.length !== 0) throw new Error(`RenderProfile export ${name} literal is unbalanced`);
  return source.slice(start, index + 1);
}

/** Extract and evaluate the literal, returning the real runtime object. */
export function evaluateRenderProfileLiteral(source, name) {
  const literal = extractRenderProfileLiteral(source, name);
  return new Function(`"use strict"; return (${literal});`)();
}
