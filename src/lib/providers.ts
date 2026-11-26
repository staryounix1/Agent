export type StageId = 'text' | 'image' | 'voice' | 'video';

export type ProviderKind = 'local' | 'google' | 'openai' | 'xai' | 'elevenlabs' | 'pollinations' | 'custom';

export interface Provider {
  id: string;
  label: string;
  stage: StageId;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  key: string;
  builtin?: boolean;
}

export interface ProviderSettings {
  providers: Provider[];
  active: Record<StageId, string>;
}

export const STAGES: { id: StageId; label: string; hint: string }[] = [
  { id: 'text', label: 'الفكرة والسكريبت', hint: 'كتابة الأفكار والمشاهد من فكرة الزبون.' },
  { id: 'image', label: 'صور المشاهد', hint: 'صورة خلفية لكل مشهد.' },
  { id: 'voice', label: 'التعليق الصوتي', hint: 'تحويل نص المشهد إلى صوت.' },
  { id: 'video', label: 'الفيديو', hint: 'توليد مقطع فيديو من وصف.' },
];

export const KINDS: { id: ProviderKind; label: string; baseUrl: string; model: string }[] = [
  { id: 'local', label: 'محلي (داخل التطبيق)', baseUrl: '', model: '' },
  { id: 'google', label: 'Google AI Studio', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash' },
  { id: 'openai', label: 'متوافق مع OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'xai', label: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', model: 'grok-4' },
  { id: 'elevenlabs', label: 'ElevenLabs', baseUrl: 'https://api.elevenlabs.io/v1', model: 'eleven_multilingual_v2' },
  { id: 'pollinations', label: 'Pollinations (مجاني بلا مفتاح)', baseUrl: 'https://image.pollinations.ai/prompt', model: 'flux' },
  { id: 'custom', label: 'مزوّد آخر (رابط يدوي)', baseUrl: '', model: '' },
];

const KEY = 'mashhad.settings.v1';

function localProvider(stage: StageId, label: string): Provider {
  return { id: `local-${stage}`, label, stage, kind: 'local', baseUrl: '', model: '', key: '', builtin: true };
}

export function defaultSettings(): ProviderSettings {
  const providers: Provider[] = [
    localProvider('text', 'قوالب مدمجة'),
    { id: 'google-text', label: 'Google AI Studio', stage: 'text', kind: 'google', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash', key: '', builtin: true },
    localProvider('image', 'بطاقات مولّدة محليًا'),
    { id: 'google-image', label: 'Google Imagen', stage: 'image', kind: 'google', baseUrl: 'https://generativelanguage.googleapis.com', model: 'imagen-3.0-generate-002', key: '', builtin: true },
    { id: 'pollinations-image', label: 'Pollinations (مجاني بلا مفتاح)', stage: 'image', kind: 'pollinations', baseUrl: 'https://image.pollinations.ai/prompt', model: 'flux', key: '', builtin: true },
    localProvider('voice', 'تسجيل من الجهاز'),
    { id: 'eleven-voice', label: 'ElevenLabs', stage: 'voice', kind: 'elevenlabs', baseUrl: 'https://api.elevenlabs.io/v1', model: 'eleven_multilingual_v2', key: '', builtin: true },
    localProvider('video', 'تركيب داخل المتصفح'),
    { id: 'xai-video', label: 'xAI Grok', stage: 'video', kind: 'xai', baseUrl: 'https://api.x.ai/v1', model: 'grok-video', key: '', builtin: true },
  ];
  return {
    providers,
    active: { text: 'local-text', image: 'local-image', voice: 'local-voice', video: 'local-video' },
  };
}

export function loadSettings(): ProviderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    const saved = JSON.parse(raw) as Partial<ProviderSettings>;
    const base = defaultSettings();
    const kept = Array.isArray(saved.providers) && saved.providers.length > 0 ? saved.providers : base.providers;
    const missing = base.providers.filter(
      (item) => item.builtin && !kept.some((savedItem) => savedItem.id === item.id),
    );
    const providers = [...kept, ...missing];
    const active = { ...base.active, ...(saved.active ?? {}) };
    return { providers, active };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: ProviderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* المتصفح ممتلئ */
  }
}

export function providerById(settings: ProviderSettings, id: string): Provider | undefined {
  return settings.providers.find((provider) => provider.id === id);
}

export function activeProvider(stage: StageId, settings = loadSettings()): Provider {
  const chosen = providerById(settings, settings.active[stage]);
  if (chosen && chosen.stage === stage) return chosen;
  return settings.providers.find((provider) => provider.stage === stage && provider.kind === 'local') ?? localProvider(stage, 'محلي');
}

export function isReady(provider: Provider): boolean {
  if (provider.kind === 'local') return true;
  if (provider.kind === 'pollinations') return Boolean(provider.baseUrl.trim());
  if (!provider.key.trim()) return false;
  return Boolean(provider.baseUrl.trim()) && Boolean(provider.model.trim());
}

export function newProvider(stage: StageId, kind: ProviderKind): Provider {
  const preset = KINDS.find((item) => item.id === kind) ?? KINDS[0];
  return {
    id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: preset.label,
    stage,
    kind,
    baseUrl: preset.baseUrl,
    model: preset.model,
    key: '',
  };
}
