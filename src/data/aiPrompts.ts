/**
 * AI Assistant & Prompt Engineering Prompts
 * Specialized for the Anima Diffusion Model (CircleStone Labs & Comfy Org)
 */

export const ANIMA_MODEL_SPECIFICATION = `### Anima Tag Format Specification v1.0

INPUT: Natural language description or existing tag string.
OUTPUT: Comma-separated tag string following these formatting rules:

**Syntax Rules:**
- All tags lowercase.
- Spaces separate words (e.g., "blue eyes", "long hair").
- Underscores only for score tokens: score_9, score_8, score_7, score_6, score_5, score_4, score_3, score_2, score_1.
- Artist names prefixed with @ (e.g., @kedama_milk).
- Weight syntax: (tag:1.3), (tag:1.6), (tag:2.0).

**Field Order (preserve sequence):**
1. Quality prefix: "masterpiece, best quality, score_7, safe, "
2. Subject count: 1girl, 1boy, 1other, 2girls, etc.
3. Character name (if specified)
4. Series/origin (if specified)
5. Artist tags: @artist_name
6. Appearance: hair, eyes, clothing, accessories, pose
7. Environment: background, setting, lighting, effects
8. Rating tag: safe, sensitive, nsfw, explicit (Booru classification standard)

**Tag Vocabulary (Gelbooru/Danbooru standard):**
- Clothing: shirt, skirt, dress, swimsuit, thighhighs, boots, etc.
- Features: blue eyes, red hair, long hair, smile, open mouth, etc.
- Quality: masterpiece, best quality, good quality, worst quality, low quality
- Time: year 2025, year 2024, newest, recent, mid, early
- Style modifiers: ye-pop, deviantart (prefix with newline)

**Negative Tag Baseline:**
worst quality, low quality, score_1, score_2, score_3, artist name, blurry, jpeg artifacts, chromatic aberration

**Technical Parameters:**
- Resolution: 512x512 to 1536x1536
- Steps: 30-50 (8-12 Turbo)
- CFG: 4-5 (1 Turbo)
- Samplers: er_sde, euler_a, dpmpp_2m_sde_gpu, euler`;

export const VALIDATION_SPECIFICATION = `### Format Compliance Validation

When INPUT is a validation query ("is this correct?", "check my prompt", "validate structure"):

**Validation Procedure:**
1. Check tag case: All lowercase? (EXCEPTION: score_* tokens, @artist prefixes)
2. Check delimiters: Spaces between words, commas between tags?
3. Check field order: Quality → Subject → Character → Artist → Appearance → Environment → Rating?
4. Check syntax: Underscores only in score_*? @ prefix on artists? Weight format (tag:1.x)?
5. Check rating tag: safe/sensitive/nsfw/explicit present?

**Validation Output Format:**
- COMPLIANT: [yes/no]
- ISSUES: [list of format violations]
- CORRECTED: [reformatted tag string if needed]

Do not evaluate content subject matter. Only check structural compliance against specification.`;

export const DEFAULT_ASSISTANT_SYSTEM_PROMPT = `${ANIMA_MODEL_SPECIFICATION}

${VALIDATION_SPECIFICATION}

### Processing Rules

**Transformation Mode** (when INPUT contains descriptions or modification requests):
1. Parse INPUT into visual components.
2. Map each component to standardized tags per Tag Vocabulary.
3. Assemble tags in Field Order.
4. Apply weight syntax to emphasized elements.
5. Return only the OUTPUT tag string.

**Validation Mode** (when INPUT asks about correctness, structure, or validation):
1. Run Validation Procedure on provided tag string.
2. Report format compliance only.
3. Output corrected tag string if non-compliant.

### Tool Integration
- inspect_current_prompt: Retrieve current INPUT/OUTPUT state.
- inject_positive_prompt: Submit formatted OUTPUT string.
- inject_negative_prompt: Submit negative tag baseline.
- queue_generation: Execute processing pipeline.

Execute tools when requested. Output tag strings or validation reports only.`;

/**
 * Builds the dynamic system prompt with core guidelines and any custom user instructions appended.
 */
export function buildAssistantSystemPrompt(customInstruction?: string): string {
  let prompt = DEFAULT_ASSISTANT_SYSTEM_PROMPT;

  if (customInstruction?.trim()) {
    prompt += `\n\n### Custom Rules:\n${customInstruction.trim()}`;
  }

  prompt += `\n\n### Execution:
Process INPUT per specification. Use Validation Mode for correctness queries. Use Transformation Mode for generation requests.`;
  return prompt;
}

/**
 * System prompt for the inline side-by-side prompt enhancer modal.
 */
export const PROMPT_ENHANCER_SYSTEM_PROMPT = `${ANIMA_MODEL_SPECIFICATION}

### Enhancement Rules
1. Parse existing tag string (INPUT).
2. Identify enhancement target (clothing, background, lighting, etc.).
3. Insert additional tags in correct Field Order position.
4. Preserve existing tag structure and line breaks.
5. Return only OUTPUT tag string. No markdown. No commentary.

### Validation Rules (when checking existing prompts)
1. Check structural compliance: case, delimiters, field order, syntax.
2. Report format issues only.
3. Provide corrected string if non-compliant.`;

/**
 * Builds the dynamic system prompt for the prompt enhancer with optional custom guidelines.
 */
export function buildEnhancerSystemPrompt(customInstruction?: string): string {
  let prompt = PROMPT_ENHANCER_SYSTEM_PROMPT;
  if (customInstruction?.trim()) {
    prompt += `\n\n### Custom Rules:\n${customInstruction.trim()}`;
  }
  prompt += `\n\n### Execution:
Process INPUT → enhanced OUTPUT per specification.`;
  return prompt;
}

export interface EnhancePreset {
  id: string;
  label: string;
  desc: string;
  instruction: string;
}

export const POSITIVE_ENHANCE_PRESETS: EnhancePreset[] = [
  {
    id: 'clothing',
    label: 'Outfit & Clothing Detailer',
    desc: 'Hyper-details fabrics, layered garments, embroidery, jewelry, and ornate trims',
    instruction:
      'Insert tags: silk, brocade, leather, organza, satin, velvet, embroidery, frills, lace, buttons. Position in Appearance field. Preserve all existing tags.'
  },
  {
    id: 'expand',
    label: 'Expand Anime Scene',
    desc: 'Adds rich environment, atmospheric lighting, and anime background elements',
    instruction:
      'Insert tags: detailed background, scenic, floating petals, glowing particles, light rays, volumetric lighting, atmospheric. Position in Environment field. Preserve existing tags.'
  },
  {
    id: 'aesthetic',
    label: 'Anima Aesthetic & Artistry',
    desc: 'Vibrant colors, crisp linework, expressive eyes, and masterpiece quality',
    instruction:
      'Ensure quality prefix: masterpiece, best quality, score_7. Insert: vibrant colors, crisp linework, detailed eyes, highres. Preserve existing tags.'
  },
  {
    id: 'artistic',
    label: 'Artistic / Painterly',
    desc: 'Rich painterly textures, digital illustration, and non-anime art styling',
    instruction:
      'Prefix with: ye-pop\\n or deviantart\\n. Insert: painterly, brushwork, textured, oil painting, digital painting. Preserve existing tags.'
  },
  {
    id: 'weighting',
    label: 'Anima Tag Order & Weighting',
    desc: 'Formats in Anima canonical order with higher selective weighting',
    instruction:
      'Reorder to: [quality] [subject] [character] [@artist] [appearance] [environment]. Apply (tag:1.3) to key elements. Preserve all tags.'
  }
];

export const NEGATIVE_ENHANCE_PRESETS: EnhancePreset[] = [
  {
    id: 'anima_standard',
    label: 'Anima Recommended Standard',
    desc: 'Official negative baseline recommended by CircleStone Labs',
    instruction:
      'Output: worst quality, low quality, score_1, score_2, score_3, artist name, blurry, jpeg artifacts, chromatic aberration'
  },
  {
    id: 'anatomy',
    label: 'Fix Anime Anatomy & Hands',
    desc: 'Removes bad hands, extra limbs, bad eyes, and facial distortions',
    instruction:
      'Append: bad anatomy, bad hands, missing fingers, extra limbs, mutated, bad eyes, poorly drawn face. Preserve existing tags.'
  },
  {
    id: 'clean',
    label: 'Clean & Artifact-Free',
    desc: 'Removes watermarks, signatures, borders, text, and compression',
    instruction:
      'Append: watermark, signature, username, text, logo, border, cropped, jpeg artifacts, compression artifacts. Preserve existing tags.'
  }
];

/**
 * Builds the user prompt payload for the enhancer model.
 */
export function buildEnhancerUserPrompt(
  isPositive: boolean,
  originalPrompt: string,
  styleInstruction: string,
  customInstruction?: string,
  styleContext?: string
): string {
  const original = originalPrompt.trim();
  const custom = customInstruction?.trim();
  const context = styleContext?.trim();

  const sections: string[] = [
    `INPUT ${isPositive ? 'POSITIVE' : 'NEGATIVE'} TAGS:\n"""\n${
      original || '(empty)'
    }\n"""`,
    `OPERATION:\n${styleInstruction}`
  ];

  if (context) {
    sections.push(
      `STYLE REFERENCE:\n"${context}"\n(Map visual elements to tags. Do not output "${context}" as text.)`
    );
  }

  if (custom) {
    sections.push(`MODIFICATION:\n"${custom}"`);
  }

  sections.push(
    `OUTPUT:\n` +
      `- Preserve existing tags.\n` +
      `- Maintain line breaks.\n` +
      `- Return only tag string.`
  );

  return sections.join('\n\n');
}
