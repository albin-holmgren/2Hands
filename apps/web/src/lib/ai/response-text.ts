/**
 * Pull the assistant's text out of a Messages-API response.
 *
 * `content[0]` is not reliably the text. Reasoning models put a `thinking`
 * block first — Grok 4.5 does, and so do Anthropic's extended-thinking modes —
 * so indexing position zero yields the wrong block and callers that guard with
 * `content[0].type === 'text'` silently fall back to an empty string. That
 * failure is invisible: no error, no log, just features that quietly stop
 * producing anything.
 *
 * Find the text block by type instead of by position.
 */

interface TextishBlock {
  type: string
  text?: string
}

export function extractResponseText(response: {
  content?: ReadonlyArray<TextishBlock>
}): string {
  const blocks = response.content ?? []
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') return block.text
  }
  return ''
}
