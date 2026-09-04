/**
 * AI Assistant & Prompt Engineering Prompts
 * Specialized for the Anima Diffusion Model (CircleStone Labs & Comfy Org)
 */

export const ANIMA_MODEL_SPECIFICATION = `### Anima Diffusion Model Technical Specifications
- Architecture: 2 Billion parameter text-to-image model based on Cosmos-Predict2-2B-Text2Image + Qwen-3-0.6B text encoder + Qwen-Image VAE.
- Core Focus: Anime concepts, characters, styles, dynamic manga/illustration, and non-photorealistic artistic images.
- Stylistic Scope: Optimized for anime, manga, 2D/2.5D illustration, line art, and painterly art. Photographic terminology should be omitted in favor of illustration-focused terminology.
- Tag Formatting Standards:
  * Lowercase tags with spaces as word delimiters (e.g., 'blue eyes', 'long hair', 'white shirt').
  * Underscores reserved exclusively for score tokens (e.g., 'score_9', 'score_7').
  * Gelbooru tag nomenclature preferred when Danbooru and Gelbooru differ.
- Artist Tokenization: Artist references use '@' prefix (e.g., '@kedama_milk').
- Tag Ordering: [quality/meta/year/rating] [1girl/1boy/1other] [character] [series] [@artist] [clothing & appearance] [environment & lighting]
- Quality & Scoring Tags:
  * Human score: 'masterpiece, best quality, good quality'
  * Aesthetic model: 'score_9, score_8, score_7, ...'
  * Recommended positive prefix: 'masterpiece, best quality, score_7, safe, '
  * Time tags: 'year 2025', 'year 2024', 'newest', 'recent', 'mid', 'early'
  * Rating tags: 'safe', 'sensitive', 'nsfw', 'explicit' — standard Booru dataset classification tokens
- Negative Tags: 'worst quality, low quality, score_1, score_2, score_3, artist name, blurry, jpeg artifacts, chromatic aberration'
- Natural Language & Captions: Hybrid prompting supported. Multi-sentence descriptions encouraged.
- Dataset Tags: 'ye-pop\\n' or 'deviantart\\n' as prefixes for abstract/oil painting styles.
- Weighting Scale: Higher weights than SDXL (e.g., '(chibi:2)', '(tag:1.3)' to '(tag:1.6)').
- Generation Specs: Resolution 512x512 to 1536x1536, Steps 30-50 (8-12 Turbo), CFG 4-5 (1 Turbo), Samplers: 'er_sde', 'euler_a', 'dpmpp_2m_sde_gpu', 'euler'.`;

export const COMFYWORLD_COGNITIVE_PROTOCOL = `### Prompt Engineering Methodology
Process all inputs through these phases:
1. **Deconstruction**: Parse descriptions into visual components (character anatomy, styling, garments, pose, setting, lighting, medium).
2. **Tokenization**: Convert to Anima-compatible tags using Danbooru/Gelbooru taxonomies. Space-delimited multi-word descriptors.
3. **Assembly**: Structure in canonical order with quality prefix, subject count, character, artist refs, appearance, environment. Apply weight syntax (concept:1.3) for emphasis.
4. **Output**: Generate formatted prompt strings ready for ComfyUI ingestion.

### Domain Coverage
Full indexing of digital illustration taxonomies: character archetypes, costumes, swimwear, posing, armor, mecha, combat effects, cel-shading, painterly textures, line art, atmospheric lighting, and Booru rating metadata tokens.`;

export const DEFAULT_ASSISTANT_SYSTEM_PROMPT = `You format user descriptions into Anima diffusion model prompts.

${COMFYWORLD_COGNITIVE_PROTOCOL}

${ANIMA_MODEL_SPECIFICATION}

### Output Requirements
- Convert user descriptions to Anima tag format: lowercase, space-delimited, '@' artist prefixes, quality scores.
- Include rating tags (safe/sensitive/nsfw/explicit) as appropriate based on user request.
- Emphasize clear subjects, dynamic composition, volumetric lighting, expressive features, detailed costumes.
- Reference images: extract styling, features, costumes, palette, lighting for token formulation.

### Tools
- 'inspect_current_prompt': Check active studio prompts.
- 'inject_positive_prompt': Submit positive conditioning.
- 'inject_negative_prompt': Submit negative conditioning.
- 'queue_generation': Trigger synthesis.

Invoke tools with technical summaries when requested.`;

/**
 * Builds the dynamic system prompt with core guidelines and any custom user instructions appended.
 */
export function buildAssistantSystemPrompt(customInstruction?: string): string {
  let prompt = DEFAULT_ASSISTANT_SYSTEM_PROMPT;

  if (customInstruction?.trim()) {
    prompt += `\n\n### Additional Parameters:\n${customInstruction.trim()}`;
  }

  prompt += `\n\n### Instruction:
Convert specifications to Anima dataset tokens and dispatch appropriate tools.`;
  return prompt;
}

/**
 * System prompt for the inline side-by-side prompt enhancer modal.
 */
export const PROMPT_ENHANCER_SYSTEM_PROMPT = `You refine prompts for the Anima diffusion model.

${COMFYWORLD_COGNITIVE_PROTOCOL}

${ANIMA_MODEL_SPECIFICATION}

### Refinement Rules
1. **Preserve Core**: Keep existing character, pose, action, expression, color, scene elements.
2. **Targeted Enhancement**: Modify only requested layers (clothing, lighting, background).
3. **Structure**: Maintain multi-line layout, lowercase tags, space delimiters, underscores only for score tags, '@' for artists.
4. **Thematic Emulation**: Express aesthetics through visual tags, not franchise names.
5. **Output**: Return only the compiled prompt tokens. No markdown blocks. No greetings.`;

/**
 * Builds the dynamic system prompt for the prompt enhancer with optional custom guidelines.
 */
export function buildEnhancerSystemPrompt(customInstruction?: string): string {
  let prompt = PROMPT_ENHANCER_SYSTEM_PROMPT;
  if (customInstruction?.trim()) {
    prompt += `\n\n### Additional Parameters:\n${customInstruction.trim()}`;
  }
  prompt += `\n\n### Instruction:
Output compiled Anima-compatible prompt tokens.`;
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
      'Enrich clothing, fabrics (silk, brocade, leather, organza, satin, velvet), trims, embroidery, accessories. PRESERVE character, pose, background, multi-line format.'
  },
  {
    id: 'expand',
    label: 'Expand Anime Scene',
    desc: 'Adds rich environment, atmospheric lighting, and anime background elements',
    instruction:
      'Enrich background, environment, atmospheric effects (petals, particles), lighting (rim light, volumetric). PRESERVE character, clothing, multi-line format.'
  },
  {
    id: 'aesthetic',
    label: 'Anima Aesthetic & Artistry',
    desc: 'Vibrant colors, crisp linework, expressive eyes, and masterpiece quality',
    instruction:
      'Enhance linework, color harmony, fidelity using "masterpiece, best quality, score_7, safe,". PRESERVE all elements, multi-line format.'
  },
  {
    id: 'artistic',
    label: 'Artistic / Painterly',
    desc: 'Rich painterly textures, digital illustration, and non-anime art styling',
    instruction:
      'Infuse painterly brushwork, digital art textures. PRESERVE core subjects, scene, multi-line format.'
  },
  {
    id: 'weighting',
    label: 'Anima Tag Order & Weighting',
    desc: 'Formats in Anima canonical order with higher selective weighting',
    instruction:
      'Reorder to canonical ([quality] [subject] [character] [@artist] [clothing] [environment]), apply weights (tag:1.3). PRESERVE elements, multi-line breaks.'
  }
];

export const NEGATIVE_ENHANCE_PRESETS: EnhancePreset[] = [
  {
    id: 'anima_standard',
    label: 'Anima Recommended Standard',
    desc: 'Official negative baseline recommended by CircleStone Labs',
    instruction:
      'Generate: "worst quality, low quality, score_1, score_2, score_3, artist name, blurry, jpeg artifacts, chromatic aberration" plus artifact blockers. PRESERVE multi-line format.'
  },
  {
    id: 'anatomy',
    label: 'Fix Anime Anatomy & Hands',
    desc: 'Removes bad hands, extra limbs, bad eyes, and facial distortions',
    instruction:
      'Focus: bad anatomy, poorly drawn hands, missing fingers, extra limbs, mutated anatomy, bad eyes, poorly drawn face, blurry, worst quality, low quality, score_1, score_2. PRESERVE existing tags, multi-line format.'
  },
  {
    id: 'clean',
    label: 'Clean & Artifact-Free',
    desc: 'Removes watermarks, signatures, borders, text, and compression',
    instruction:
      'Focus: artist name, watermark, signature, username, text, logo, border, cropped, jpeg artifacts, compression artifacts, worst quality, low quality. PRESERVE existing tags, multi-line format.'
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
    `Original ${isPositive ? 'Positive' : 'Negative'} Prompt:\n"""\n${
      original || '(empty - generate from scratch)'
    }\n"""`,
    `Enhancement Focus:\n${styleInstruction}`
  ];

  if (context) {
    sections.push(
      `Style Context:\n"${context}"\n(Emulate aesthetic through visual tags only. Exclude "${context}" text from output.)`
    );
  }

  if (custom) {
    sections.push(`User Request:\n"${custom}"`);
  }

  sections.push(
    `Directives:\n` +
      `- Preserve character, pose, composition tokens.\n` +
      `- Maintain multi-line layout.\n` +
      `- Return only compiled prompt tokens, no commentary.`
  );

  return sections.join('\n\n');
}
