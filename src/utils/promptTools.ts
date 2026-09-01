export interface PromptTag {
  id: string;
  text: string;
  weight: number;
  disabled?: boolean;
}

export interface WeightAdjustResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface FormatOptions {
  deduplicate?: boolean;
}

/**
 * Parses a single tag string into its base text and numerical weight.
 * Supports:
 * - `(masterpiece:1.2)` -> { text: 'masterpiece', weight: 1.2 }
 * - `(masterpiece)` -> { text: 'masterpiece', weight: 1.1 }
 * - `masterpiece` -> { text: 'masterpiece', weight: 1.0 }
 * - `(1girl, solo:1.15)` -> { text: '1girl, solo', weight: 1.15 }
 */
export function parseTagWeight(tagStr: string): {
  text: string;
  weight: number;
} {
  const trimmed = tagStr.trim();
  if (!trimmed) return { text: '', weight: 1.0 };

  // Check for (text:weight) format
  const colonMatch = /^\((.+):([0-9.]+)\)$/u.exec(trimmed);
  if (colonMatch && colonMatch[1] && colonMatch[2]) {
    const w = Number(colonMatch[2]);
    if (!isNaN(w)) {
      return { text: colonMatch[1].trim(), weight: Math.round(w * 100) / 100 };
    }
  }

  // Check for simple (text) format
  const parenMatch = /^\((.+)\)$/u.exec(trimmed);
  if (parenMatch && parenMatch[1]) {
    return { text: parenMatch[1].trim(), weight: 1.1 };
  }

  return { text: trimmed, weight: 1.0 };
}

/**
 * Formats a tag and weight into standard ComfyUI / SD syntax.
 */
export function formatTagWeight(text: string, weight: number): string {
  const cleanText = text.trim();
  if (!cleanText) return '';
  const rounded = Math.round(weight * 100) / 100;
  if (rounded === 1.0) {
    return cleanText;
  }
  return `(${cleanText}:${rounded.toFixed(rounded % 1 === 0 ? 1 : 2).replace(/\.?0+$/u, (m) => (m.includes('.') ? (m === '.0' ? '.0' : '') : ''))})`;
}

/**
 * Adjusts the weight of the currently selected text or the tag at the cursor.
 * @param text The full prompt string
 * @param selStart Cursor/selection start index
 * @param selEnd Cursor/selection end index
 * @param delta Weight step (e.g. +0.05 or -0.05)
 */
export function adjustPromptWeight(
  text: string,
  selStart: number,
  selEnd: number,
  delta: number
): WeightAdjustResult {
  if (!text) {
    return { text: '', selectionStart: 0, selectionEnd: 0 };
  }

  let start = selStart;
  let end = selEnd;

  // If no range is selected, expand to surrounding tag bounds
  if (start === end) {
    // Look backward for start of tag (comma, newline, or string start)
    // Also respect outer parentheses if cursor is inside (tag:1.2)
    let left = start;
    let openParenDepth = 0;
    while (left > 0) {
      const char = text[left - 1];
      if (char === ')') openParenDepth++;
      else if (char === '(') {
        if (openParenDepth > 0) openParenDepth--;
        else {
          // Inside a paren group
          left--;
          break;
        }
      } else if ((char === ',' || char === '\n') && openParenDepth === 0) {
        break;
      }
      left--;
    }

    // Look forward for end of tag
    let right = end;
    let closeParenDepth = 0;
    while (right < text.length) {
      const char = text[right];
      if (char === '(') closeParenDepth++;
      else if (char === ')') {
        if (closeParenDepth > 0) closeParenDepth--;
        else {
          right++;
          break;
        }
      } else if ((char === ',' || char === '\n') && closeParenDepth === 0) {
        break;
      }
      right++;
    }

    start = left;
    end = right;
  }

  // Extract selected fragment
  const selected = text.slice(start, end);
  const leadingSpaces = selected.match(/^\s*/u)?.[0] || '';
  const trailingSpaces = selected.match(/\s*$/u)?.[0] || '';
  const core = selected.trim();

  if (!core) {
    return { text, selectionStart: selStart, selectionEnd: selEnd };
  }

  // Parse existing weight
  const parsed = parseTagWeight(core);
  let newWeight = Math.round((parsed.weight + delta) * 100) / 100;
  newWeight = Math.max(0.1, Math.min(3.0, newWeight));

  // Format new core
  let newCore: string;
  if (newWeight === 1.0) {
    newCore = parsed.text;
  } else {
    // Format nicely: e.g. 1.05, 1.1, 1.25, 0.95
    newCore = `(${parsed.text}:${Number(newWeight.toFixed(2))})`;
  }

  const replacement = leadingSpaces + newCore + trailingSpaces;
  const newText = text.slice(0, start) + replacement + text.slice(end);
  const newSelStart = start + leadingSpaces.length;
  const newSelEnd = newSelStart + newCore.length;

  return {
    text: newText,
    selectionStart: newSelStart,
    selectionEnd: newSelEnd
  };
}

/**
 * Cleans and formats prompt string:
 * - Trims whitespace around tags
 * - Fixes dangling/multiple commas
 * - Optionally removes duplicate tags
 */
export function formatAndCleanPrompt(
  prompt: string,
  options?: FormatOptions
): string {
  if (!prompt.trim()) return '';
  const deduplicate = options?.deduplicate ?? true;

  const rawTags = prompt.split(/[,，\n]+/u);
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const raw of rawTags) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Normalizing for duplicate detection (case-insensitive on base text)
    const normalizedKey = trimmed.toLowerCase();
    if (deduplicate) {
      if (seen.has(normalizedKey)) continue;
      seen.add(normalizedKey);
    }

    cleaned.push(trimmed);
  }

  return cleaned.join(', ');
}

/**
 * Estimates token count and CLIP 75-token chunks.
 */
export function estimateClipTokens(prompt: string): {
  count: number;
  maxChunk: number;
  chunks: number;
  percentage: number;
} {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return { count: 0, maxChunk: 75, chunks: 1, percentage: 0 };
  }

  // Rough estimation: words + punctuation
  const words = trimmed.split(/[\s,，|\n]+/u).filter(Boolean);
  let count = 0;
  for (const word of words) {
    // Add extra tokens for subwords or special punctuation/weights
    if (word.length > 8) {
      count += Math.ceil(word.length / 4);
    } else {
      count += 1;
    }
  }

  const chunks = Math.max(1, Math.ceil(count / 75));
  const currentChunkTokens = count % 75 || (count > 0 ? 75 : 0);
  const percentage = Math.min(100, Math.round((currentChunkTokens / 75) * 100));

  return {
    count,
    maxChunk: chunks * 75,
    chunks,
    percentage
  };
}

/**
 * Parses comma-separated prompt into individual tag chips for interactive mode.
 */
export function parsePromptToChips(prompt: string): PromptTag[] {
  if (!prompt.trim()) return [];

  const rawTags = prompt.split(/[,，\n]+/u);
  const result: PromptTag[] = [];

  for (let i = 0; i < rawTags.length; i++) {
    const raw = rawTags[i]?.trim();
    if (!raw) continue;
    const { text, weight } = parseTagWeight(raw);
    if (text) {
      result.push({
        id: `tag-${i}-${crypto.randomUUID().slice(0, 8)}`,
        text,
        weight,
        disabled: false
      });
    }
  }

  return result;
}

/**
 * Reconstructs prompt string from active (non-disabled) tag chips.
 */
export function reconstructPromptFromChips(chips: PromptTag[]): string {
  return chips
    .filter((c) => !c.disabled)
    .map((c) => formatTagWeight(c.text, c.weight))
    .filter(Boolean)
    .join(', ');
}
