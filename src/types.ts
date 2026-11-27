export type Lang = 'ar' | 'fr' | 'en';
export type Aspect = '9:16' | '1:1' | '16:9';
export type Stage = 'idea' | 'script' | 'assets' | 'edit' | 'ready';
export type Template = 'story' | 'tips' | 'howto' | 'promo';
export type Motion = 'in' | 'out' | 'left' | 'right' | 'none';
export type View = 'projects' | 'script' | 'scenes' | 'edit' | 'publish';

export interface Scene {
  id: string;
  text: string;
  visual: string;
  seconds: number;
  motion: Motion;
  imageId?: string;
  videoId?: string;
  videoSeconds?: number;
  videoFromGrok?: boolean;
  audioId?: string;
  audioSeconds?: number;
  voiceSource?: 'mic' | 'upload';
}

export interface PublishMeta {
  title: string;
  description: string;
  hashtags: string[];
}

export interface Project {
  id: string;
  seriesId: string;
  title: string;
  idea: string;
  lang: Lang;
  aspect: Aspect;
  template: Template;
  stage: Stage;
  targetSeconds: number;
  scenes: Scene[];
  captions: { enabled: boolean; size: number };
  music: { source: 'none' | 'builtin' | 'upload'; assetId?: string; volume: number };
  videoAudio?: boolean;
  meta: PublishMeta | null;
  createdAt: number;
  updatedAt: number;
  exportCount: number;
  /** الفيديوهات المصدرة المحفوظة على الجهاز (سقفها MAX_EXPORTS). */
  exports?: ExportRecord[];
}

export interface ExportRecord {
  id: string;
  name: string;
  bytes: number;
  duration: number;
  createdAt: number;
}

export interface Series {
  id: string;
  name: string;
  createdAt: number;
}

export interface AppState {
  version: 1;
  series: Series[];
  projects: Project[];
  selectedId: string | null;
}

export interface Asset {
  id: string;
  kind: 'image' | 'audio' | 'video';
  name: string;
  mime: string;
  blob: Blob;
  duration?: number;
  width?: number;
  height?: number;
  createdAt: number;
}

export const STAGES: { id: Stage; label: string; short: string }[] = [
  { id: 'idea', label: 'فكرة', short: 'فكرة' },
  { id: 'script', label: 'سكريبت', short: 'سكريبت' },
  { id: 'assets', label: 'صور وصوت', short: 'صور وصوت' },
  { id: 'edit', label: 'مونتاج', short: 'مونتاج' },
  { id: 'ready', label: 'جاهز', short: 'جاهز' },
];

export const ASPECTS: { id: Aspect; label: string; w: number; h: number; hint: string }[] = [
  { id: '9:16', label: '9:16', w: 1080, h: 1920, hint: 'ريلز، تيك توك، شورتس' },
  { id: '1:1', label: '1:1', w: 1080, h: 1080, hint: 'إنستغرام، فيسبوك' },
  { id: '16:9', label: '16:9', w: 1920, h: 1080, hint: 'يوتيوب، لينكدإن' },
];

export const TEMPLATES: { id: Template; label: string; desc: string; structure: string[] }[] = [
  { id: 'story', label: 'قصة', desc: 'بداية، تحوّل، خلاصة', structure: ['خطّاف', 'السياق', 'التحوّل', 'الخلاصة', 'دعوة'] },
  { id: 'tips', label: 'نصائح', desc: 'خطّاف ثم ثلاث نصائح', structure: ['خطّاف', 'نصيحة ١', 'نصيحة ٢', 'نصيحة ٣', 'دعوة'] },
  { id: 'howto', label: 'خطوات', desc: 'شرح عملي من الخطوة إلى النتيجة', structure: ['خطّاف', 'الخطوة ١', 'الخطوة ٢', 'النتيجة', 'دعوة'] },
  { id: 'promo', label: 'منتج', desc: 'مشكلة، حل، دليل، دعوة', structure: ['مشكلة', 'الحل', 'الدليل', 'العرض', 'دعوة'] },
];

export const LANGS: { id: Lang; label: string; native: string; dir: 'rtl' | 'ltr'; locale: string }[] = [
  { id: 'ar', label: 'العربية', native: 'العربية', dir: 'rtl', locale: 'ar-MA' },
  { id: 'fr', label: 'الفرنسية', native: 'Français', dir: 'ltr', locale: 'fr-FR' },
  { id: 'en', label: 'الإنجليزية', native: 'English', dir: 'ltr', locale: 'en-US' },
];
