export interface PromptCategory {
  id: string;
  name: string;
  description?: string;
  tags: string[];
}

export const DEFAULT_PROMPT_CATEGORIES: PromptCategory[] = [
  // ─── Foundation ───────────────────────────────────────────────
  {
    id: 'quality',
    name: 'Style & Quality',
    description: 'Resolution, finish, and rendering style boosters',
    tags: [
      'masterpiece',
      'best quality',
      'highres',
      'absurdres',
      'ultra-detailed',
      'extremely detailed',
      'intricate details',
      'official art',
      'anime screencap',
      'anime coloring',
      'cel shading',
      'soft shading',
      'flat color',
      'clean lineart',
      'sketch',
      'lineart',
      'monochrome',
      'greyscale',
      'sepia',
      'pastel colors',
      'vibrant colors',
      'muted colors',
      'high contrast',
      'depth of field',
      'bokeh',
      'sharp focus',
      '8k wallpaper',
      'aesthetic',
      'cinematic',
      'film grain',
      'retro artstyle',
      '1980s style',
      '1990s style'
    ]
  },
  {
    id: 'count',
    name: 'Character Count',
    description: 'How many characters are in frame',
    tags: [
      '1girl',
      '1boy',
      '2girls',
      '2boys',
      'multiple girls',
      'multiple boys',
      'solo',
      'solo focus',
      'duo',
      'couple',
      'group',
      'crowd'
    ]
  },

  {
    id: 'composition',
    name: 'Composition & Camera',
    description: 'Shot distance, angle, and framing',
    tags: [
      'portrait',
      'upper body',
      'cowboy shot',
      'full body',
      'close-up',
      'face focus',
      'extreme close-up',
      'wide shot',
      'dutch angle',
      'dynamic angle',
      'fisheye',
      'foreshortening',
      'from above',
      'from below',
      'from side',
      'from behind',
      'over shoulder',
      'profile',
      'silhouette',
      'vanishing point',
      'panning view',
      'tilted frame',
      'head out of frame',
      'centered'
    ]
  },

  // ─── Atmosphere & Setting ─────────────────────────────────────
  {
    id: 'lighting',
    name: 'Lighting & Atmosphere',
    description: 'Light sources, time of day, and ambient mood',
    tags: [
      'cinematic lighting',
      'volumetric lighting',
      'dramatic lighting',
      'moody lighting',
      'soft lighting',
      'rim lighting',
      'backlit',
      'dappled sunlight',
      'sunbeam',
      'god rays',
      'golden hour',
      'blue hour',
      'sunrise',
      'sunset',
      'twilight',
      'neon glow',
      'neon lights',
      'lens flare',
      'ambient light',
      'studio lighting',
      'candlelight',
      'lantern',
      'moonlight',
      'moonbeam',
      'starlight',
      'glowing',
      'dark theme',
      'dim light',
      'light particles',
      'floating particles',
      'embers',
      'fireflies',
      'smoke',
      'haze',
      'dust motes'
    ]
  },
  {
    id: 'background',
    name: 'Background & Scenery',
    description: 'Where the scene happens',
    tags: [
      'simple background',
      'white background',
      'black background',
      'gradient background',
      'scenery',
      'city',
      'cityscape',
      'city street',
      'cyberpunk',
      'cyberpunk city',
      'tokyo street',
      'rooftop',
      'alleyway',
      'shrine',
      'torii gate',
      'temple',
      'castle',
      'fantasy landscape',
      'floating islands',
      'ancient ruins',
      'forest',
      'deep forest',
      'bamboo forest',
      'flower field',
      'sunflower field',
      'meadow',
      'mountain',
      'lake',
      'river',
      'waterfall',
      'ocean',
      'beach',
      'tropical beach',
      'underwater',
      'clouds',
      'night sky',
      'starry sky',
      'milky way',
      'full moon',
      'crescent moon',
      'aurora',
      'cherry blossoms',
      'falling petals',
      'classroom',
      'school',
      'library',
      'cafe',
      'cafe interior',
      'restaurant',
      'kitchen',
      'bedroom',
      'living room',
      'bathroom',
      'hot spring',
      'train interior',
      'train station',
      'car interior',
      'convenience store',
      'festival',
      'summer festival',
      'fireworks',
      'amusement park'
    ]
  },
  {
    id: 'weather',
    name: 'Weather & Season',
    description: 'Sky conditions and time of year',
    tags: [
      'sunny',
      'clear sky',
      'overcast',
      'rain',
      'drizzle',
      'heavy rain',
      'thunderstorm',
      'lightning',
      'snow',
      'snowing',
      'heavy snow',
      'blizzard',
      'wind',
      'gust of wind',
      'fog',
      'mist',
      'heat haze',
      'rainbow',
      'spring',
      'summer',
      'autumn',
      'winter',
      'falling leaves'
    ]
  }
];

// ─── Negative Prompt Presets ────────────────────────────────────
// Same shape as PROMPT_CATEGORIES — map these onto a negative
// prompt field if the UI has one.

export const NEGATIVE_PRESETS: PromptCategory[] = [
  {
    id: 'neg_base',
    name: 'Quality Cleanup',
    description: 'The standard anti-artifact baseline',
    tags: [
      'lowres',
      'worst quality',
      'low quality',
      'normal quality',
      'jpeg artifacts',
      'blurry',
      'text',
      'watermark',
      'signature',
      'username',
      'logo',
      'cropped',
      'out of frame',
      'error'
    ]
  },
  {
    id: 'neg_anatomy',
    name: 'Anatomy Fixes',
    description: 'Hands, limbs, and proportion damage control',
    tags: [
      'bad anatomy',
      'bad hands',
      'bad proportions',
      'deformed',
      'mutated',
      'extra limbs',
      'extra digits',
      'missing digits',
      'fused fingers',
      'too many fingers',
      'malformed hands',
      'long neck',
      'cross-eyed'
    ]
  },
  {
    id: 'neg_style',
    name: 'Style Guardrails',
    description: 'Keeps renders on-model and fully colored',
    tags: [
      'sketch',
      'monochrome',
      'greyscale',
      'duotone',
      '3d',
      'realistic',
      'multiple views',
      'duplicate',
      'censored'
    ]
  }
];

export const PROMPT_CATEGORIES = DEFAULT_PROMPT_CATEGORIES;

export const PROMPT_CATEGORY_MAP: Record<string, PromptCategory> =
  Object.fromEntries(DEFAULT_PROMPT_CATEGORIES.map((c) => [c.id, c]));
