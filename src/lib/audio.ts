let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const buffer = await blob.arrayBuffer();
  return audioContext().decodeAudioData(buffer);
}

export async function audioSeconds(blob: Blob): Promise<number> {
  try {
    const buffer = await decodeBlob(blob);
    return Math.round(buffer.duration * 10) / 10;
  } catch {
    return 0;
  }
}

const LANG_TAGS: Record<string, string[]> = {
  ar: ['ar-MA', 'ar-SA', 'ar-EG', 'ar'],
  fr: ['fr-FR', 'fr-CA', 'fr'],
  en: ['en-US', 'en-GB', 'en'],
};

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const tags = LANG_TAGS[lang] ?? [lang];
  const voices = window.speechSynthesis.getVoices();
  for (const tag of tags) {
    const match = voices.find((v) => v.lang?.replace('_', '-').toLowerCase().startsWith(tag.toLowerCase()));
    if (match) return match;
  }
  return null;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string, lang: string, rate = 0.98): Promise<void> {
  if (!ttsSupported()) return Promise.reject(new Error('المتصفح لا يدعم النطق'));
  window.speechSynthesis.cancel();
  return new Promise((resolve, reject) => {
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(lang);
    if (voice) utter.voice = voice;
    utter.lang = voice?.lang ?? LANG_TAGS[lang]?.[0] ?? lang;
    utter.rate = rate;
    utter.pitch = 1;
    utter.onend = () => {
      currentUtterance = null;
      resolve();
    };
    utter.onerror = (event) => {
      currentUtterance = null;
      if (event.error === 'interrupted' || event.error === 'canceled') resolve();
      else reject(new Error(`تعذّر النطق: ${event.error}`));
    };
    currentUtterance = utter;
    window.speechSynthesis.speak(utter);
  });
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  return !!currentUtterance;
}

export interface ActiveRecorder {
  stop: () => Promise<Blob>;
  cancel: () => void;
  mime: string;
}

export async function startMicRecording(): Promise<ActiveRecorder> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('المتصفح لا يوفّر وصولًا للميكروفون');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  const mime = preferred.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) ?? '';
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.start(200);

  const cleanup = () => stream.getTracks().forEach((track) => track.stop());

  return {
    mime: mime || 'audio/webm',
    cancel: () => {
      try {
        recorder.stop();
      } catch {
        /* سبق إيقافه */
      }
      cleanup();
    },
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: mime || 'audio/webm' }));
        };
        if (recorder.state === 'inactive') {
          cleanup();
          resolve(new Blob(chunks, { type: mime || 'audio/webm' }));
        } else {
          recorder.stop();
        }
      }),
  };
}

let ambientCache: AudioBuffer | null = null;

/** نغمة خلفية هادئة مولّدة داخل التطبيق (بدون ملفات خارجية أو حقوق). */
export async function ambientBuffer(): Promise<AudioBuffer> {
  if (ambientCache) return ambientCache;
  const sampleRate = 44100;
  const dur = 24;
  const offline = new OfflineAudioContext(2, sampleRate * dur, sampleRate);
  const master = offline.createGain();
  master.gain.value = 0.5;
  master.connect(offline.destination);

  const filter = offline.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  filter.Q.value = 0.6;
  filter.connect(master);

  const notes = [146.83, 220.0, 293.66, 349.23, 440.0, 587.33];
  notes.forEach((freq, i) => {
    const osc = offline.createOscillator();
    osc.type = i % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = (i - 2.5) * 3.5;

    const gain = offline.createGain();
    gain.gain.value = 0.085 / (1 + i * 0.25);

    const lfo = offline.createOscillator();
    lfo.frequency.value = 0.04 + i * 0.013;
    const lfoGain = offline.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    osc.connect(gain);
    gain.connect(filter);
    osc.start(0);
    osc.stop(dur);
    lfo.start(0);
    lfo.stop(dur);
  });

  const buffer = await offline.startRendering();
  ambientCache = buffer;
  return buffer;
}

export async function musicBufferFromBlob(blob: Blob): Promise<AudioBuffer> {
  return decodeBlob(blob);
}
