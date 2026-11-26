import type { Aspect, Lang, Scene, Template } from '../types';
import { estimateSeconds } from './timeline';
import type { Provider } from './providers';

export interface ScriptInput {
  idea: string;
  template: Template;
  seconds: number;
  lang: Lang;
}

const TEMPLATE_HINT: Record<Template, string> = {
  story: 'قصة قصيرة بحبكة: بداية، تحوّل، خلاصة.',
  tips: 'نصائح مرقّمة، كل نصيحة فكرة واحدة.',
  howto: 'خطوات عملية مرتبة من الأولى إلى الأخيرة.',
  promo: 'عرض تجاري قصير ينتهي بدعوة واضحة للتجربة.',
};

const LANG_NAME: Record<Lang, string> = { ar: 'العربية', fr: 'الفرنسية', en: 'الإنجليزية' };

function scriptPrompt(input: ScriptInput): string {
  return [
    'أنت كاتب فيديوهات قصيرة للسوشيال ميديا.',
    `اكتب سكريبت فيديو باللغة ${LANG_NAME[input.lang]} حول الفكرة: «${input.idea}».`,
    `نوع المحتوى: ${TEMPLATE_HINT[input.template]}`,
    `المدة الإجمالية المطلوبة: ${input.seconds} ثانية (3 إلى 6 مشاهد).`,
    'أعد الإجابة JSON فقط بلا شرح، بهذا الشكل:',
    '{"scenes":[{"text":"النص المنطوق","visual":"وصف بصري قصير لما يظهر على الشاشة","seconds":4}]}',
    'اجعل مجموع seconds قريبًا من المدة المطلوبة، والنص منطوقًا طبيعيًا لا مكتوبًا.',
  ].join('\n');
}

function stripFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

function parseScenes(raw: string, lang: Lang): Scene[] {
  const body = stripFence(raw);
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  const json = start >= 0 && end > start ? body.slice(start, end + 1) : body;
  const parsed = JSON.parse(json) as { scenes?: { text?: string; visual?: string; seconds?: number }[] };
  const list = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const motions = ['in', 'out', 'left', 'right', 'in'] as const;
  const scenes: Scene[] = list
    .filter((scene) => typeof scene.text === 'string' && scene.text.trim().length > 1)
    .slice(0, 8)
    .map((scene, index) => ({
      id: `sc-${Date.now().toString(36)}-${index}`,
      text: String(scene.text).trim(),
      visual: String(scene.visual ?? '').trim() || 'لقطة قريبة مع حركة خفيفة',
      seconds: Math.max(
        2,
        Math.round(
          Number(scene.seconds) > 0 ? Number(scene.seconds) : estimateSeconds(String(scene.text), lang),
        ),
      ),
      motion: motions[index % motions.length],
    }));
  if (scenes.length === 0) throw new Error('الرد ما كانش فيه مشاهد صالحة');
  return scenes;
}

/** الرابط الأساسي بعد تنظيف المسافات والشرطة الأخيرة واللواحق الشائعة التي يلصقها المستخدم. */
function baseOf(provider: Provider): string {
  let base = provider.baseUrl.trim().replace(/\/+$/, '');
  if (provider.kind === 'google') {
    base = base.replace(/\/v1beta\/?.*$/, '').replace(/\/openai$/, '');
    return base || 'https://generativelanguage.googleapis.com';
  }
  base = base.replace(/\/chat\/completions$/, '').replace(/\/images\/generations$/, '');
  return base;
}

function keyOf(provider: Provider): string {
  const key = provider.key.trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('المفتاح خالي — لصق المفتاح في الحقل أولًا.');
  return key;
}

function authHeaders(provider: Provider): Record<string, string> {
  const key = keyOf(provider);
  if (provider.kind === 'google') return { 'x-goog-api-key': key };
  if (provider.kind === 'elevenlabs') return { 'xi-api-key': key };
  return { Authorization: `Bearer ${key}` };
}

/** يبني رسالة خطأ فيها نص المزوّد كما رجعه هو، بدل رمز الحالة وحده. */
async function failure(response: Response, label: string): Promise<Error> {
  let detail = '';
  try {
    const text = await response.text();
    try {
      const body = JSON.parse(text) as {
        error?: { message?: string; status?: string } | string;
        message?: string;
      };
      if (typeof body.error === 'string') detail = body.error;
      else detail = body.error?.message ?? body.message ?? text;
    } catch {
      detail = text;
    }
  } catch {
    detail = '';
  }
  detail = detail.replace(/\s+/g, ' ').trim().slice(0, 220);
  return new Error(`${label} رفض الطلب (HTTP ${response.status})${detail ? `: ${detail}` : ''}`);
}

async function googleText(provider: Provider, prompt: string): Promise<string> {
  const url = `${baseOf(provider)}/v1beta/models/${encodeURIComponent(provider.model.trim())}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(provider) },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
    }),
  });
  if (!response.ok) throw await failure(response, 'Google');
  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (!text.trim()) throw new Error('Google رجع ردًّا فارغًا');
  return text;
}

async function openAIText(provider: Provider, prompt: string): Promise<string> {
  const url = `${baseOf(provider)}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(provider) },
    body: JSON.stringify({
      model: provider.model.trim(),
      temperature: 0.9,
      messages: [
        { role: 'system', content: 'أعد JSON صالحًا فقط دون أي شرح.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) throw await failure(response, provider.label);
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('المزوّد رجع ردًّا فارغًا');
  return text;
}

export function textSupported(provider: Provider): boolean {
  return provider.kind === 'google' || provider.kind === 'openai' || provider.kind === 'xai' || provider.kind === 'custom';
}

export async function generateScript(provider: Provider, input: ScriptInput): Promise<Scene[]> {
  if (!textSupported(provider)) throw new Error('هذا المزوّد لا يدعم النص');
  const prompt = scriptPrompt(input);
  const raw = provider.kind === 'google' ? await googleText(provider, prompt) : await openAIText(provider, prompt);
  return parseScenes(raw, input.lang);
}

const ASPECT_PROMPT: Record<Aspect, string> = {
  '9:16': 'a vertical 9:16 frame',
  '1:1': 'a square 1:1 frame',
  '16:9': 'a wide 16:9 frame',
};

const IMAGE_SIZE: Record<Aspect, string> = {
  '9:16': '1024x1792',
  '1:1': '1024x1024',
  '16:9': '1792x1024',
};

export function imageSupported(provider: Provider): boolean {
  return (
    provider.kind === 'google' ||
    provider.kind === 'openai' ||
    provider.kind === 'xai' ||
    provider.kind === 'pollinations' ||
    provider.kind === 'custom'
  );
}

/** Pollinations مجاني وبلا مفتاح: صورة لكل 45 ثانية على الأكثر من نفس الشبكة. */
const POLLINATIONS_SIZE: Record<Aspect, [number, number]> = {
  '9:16': [432, 768],
  '1:1': [768, 768],
  '16:9': [768, 432],
};

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function generateSceneImage(provider: Provider, prompt: string, aspect: Aspect): Promise<Blob> {
  if (!imageSupported(provider)) throw new Error('هذا المزوّد لا يدعم الصور');
  const fullPrompt = `${prompt}. Cinematic stock-photo style, soft natural light, no text, no watermark, ${ASPECT_PROMPT[aspect]}.`;
  const base = baseOf(provider);

  if (provider.kind === 'pollinations') {
    const [width, height] = POLLINATIONS_SIZE[aspect];
    const seed = Math.floor(Math.random() * 1_000_000);
    const url = `${base}/${encodeURIComponent(fullPrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=${encodeURIComponent(provider.model.trim() || 'flux')}`;
    const response = await fetch(url);
    if (!response.ok) throw await failure(response, 'Pollinations');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Pollinations رجع بلا صورة');
    return blob;
  }

  if (provider.kind === 'google') {
    const url = `${base}/v1beta/models/${encodeURIComponent(provider.model.trim())}:predict`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(provider) },
      body: JSON.stringify({
        instances: [{ prompt: fullPrompt }],
        parameters: { sampleCount: 1, aspectRatio: aspect },
      }),
    });
    if (!response.ok) throw await failure(response, 'Google Imagen');
    const data = (await response.json()) as { predictions?: { bytesBase64Encoded?: string; mimeType?: string }[] };
    const first = data.predictions?.[0];
    if (!first?.bytesBase64Encoded) throw new Error('Imagen رجع بلا صورة');
    return base64ToBlob(first.bytesBase64Encoded, first.mimeType ?? 'image/png');
  }

  const response = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(provider) },
    body: JSON.stringify({
      model: provider.model.trim(),
      prompt: fullPrompt,
      n: 1,
      size: IMAGE_SIZE[aspect],
      response_format: 'b64_json',
    }),
  });
  if (!response.ok) throw await failure(response, provider.label);
  const data = (await response.json()) as { data?: { b64_json?: string; url?: string }[] };
  const first = data.data?.[0];
  if (first?.b64_json) return base64ToBlob(first.b64_json, 'image/png');
  if (first?.url) {
    const image = await fetch(first.url);
    if (!image.ok) throw new Error('تعذّر تنزيل الصورة');
    return image.blob();
  }
  throw new Error('المزوّد رجع بلا صورة');
}

export async function testProvider(provider: Provider): Promise<string> {
  if (provider.kind === 'local') return 'المزوّد المحلي لا يحتاج مفتاحًا.';
  const base = baseOf(provider);
  if (provider.kind === 'pollinations') {
    const url = `${base}/${encodeURIComponent('a small test photo of a tea glass')}?width=256&height=256&seed=1&nologo=true`;
    const response = await fetch(url);
    if (response.status === 402 || response.status === 429)
      return 'الخدمة تعمل، لكن الحد المجاني مشغول الآن — انتظر 45 ثانية وأعد المحاولة.';
    if (!response.ok) throw await failure(response, 'Pollinations');
    const type = response.headers.get('content-type') ?? '';
    return type.startsWith('image/') ? 'الخدمة تعمل بلا مفتاح.' : 'رد غير متوقع من Pollinations.';
  }
  if (provider.kind === 'google') {
    const response = await fetch(`${base}/v1beta/models`, { headers: authHeaders(provider) });
    if (!response.ok) throw await failure(response, 'Google');
    const data = (await response.json()) as { models?: { name?: string }[] };
    const model = provider.model.trim();
    const found = (data.models ?? []).some((item) => (item.name ?? '').includes(model));
    return found ? `المفتاح صالح و${model} متاح.` : 'المفتاح صالح، لكن الموديل غير ظاهر في القائمة.';
  }
  if (provider.kind === 'elevenlabs') {
    const response = await fetch(`${base}/user`, { headers: authHeaders(provider) });
    if (!response.ok) throw await failure(response, 'ElevenLabs');
    return 'المفتاح صالح.';
  }
  const response = await fetch(`${base}/models`, { headers: authHeaders(provider) });
  if (!response.ok) throw await failure(response, provider.label);
  return 'المفتاح صالح والرابط يجيب.';
}
