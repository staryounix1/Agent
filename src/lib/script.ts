import type { Lang, PublishMeta, Project, Scene, Template } from '../types';
import { LANGS } from '../types';
import { newId } from './storage';

type Role =
  | 'hook'
  | 'context'
  | 'turn'
  | 'resolve'
  | 'cta'
  | 'tip1'
  | 'tip2'
  | 'tip3'
  | 'step1'
  | 'step2'
  | 'result'
  | 'problem'
  | 'solution'
  | 'proof'
  | 'offer';

const ROLES: Record<Template, Role[]> = {
  story: ['hook', 'context', 'turn', 'resolve', 'cta'],
  tips: ['hook', 'tip1', 'tip2', 'tip3', 'cta'],
  howto: ['hook', 'step1', 'step2', 'result', 'cta'],
  promo: ['problem', 'solution', 'proof', 'offer', 'cta'],
};

const WEIGHTS: Record<Template, number[]> = {
  story: [0.18, 0.22, 0.24, 0.22, 0.14],
  tips: [0.18, 0.24, 0.24, 0.22, 0.12],
  howto: [0.18, 0.26, 0.26, 0.18, 0.12],
  promo: [0.2, 0.26, 0.22, 0.18, 0.14],
};

type Copy = { text: string; visual: string };

const COPY: Record<Lang, Record<Role, (idea: string) => Copy>> = {
  ar: {
    hook: (i) => ({
      text: `${i} — هذا الموضوع له أهمية أكبر مما نتخيل، وفي أقل من دقيقة نوضح لك الفكرة كاملة.`,
      visual: `افتتاحية قريبة من الوجه مع خلفية بسيطة، وعنوان عريض يحمل العبارة: ${i}`,
    }),
    context: (i) => ({
      text: `البداية كانت بسيطة: فكرة صغيرة حول ${i}، ثم تحوّلت إلى شيء نراه اليوم في كل مكان.`,
      visual: `لقطات عامة تُظهر السياق، مع إضاءة دافئة ونص مساعد صغير في أعلى الإطار`,
    }),
    turn: () => ({
      text: `لكن المشكلة ظهرت عندما حاولنا التوسّع، فكل خطوة جديدة كانت تحتاج وقتًا وموارد لا نملكها.`,
      visual: `زاوية أوسع تُبرز التفاصيل، مع انتقال سريع ولقطة قريبة على التفصيل المهم`,
    }),
    resolve: () => ({
      text: `الحل كان في تغيير الترتيب فقط: نبدأ من النتيجة، ونشرح الطريق بعدها، فصار كل شيء أوضح.`,
      visual: `مقارنة بصرية بين الحالتين: قبل وبعد، بلونين مختلفين وخط واضح`,
    }),
    cta: () => ({
      text: `قل لي في التعليقات: من أين ستبدأ أنت؟ واحفظ الفيديو للمرة القادمة.`,
      visual: `لقطة نهائية هادئة مع مساحة للنص ودعوة واضحة إلى المتابعة`,
    }),
    tip1: (i) => ({
      text: `النصيحة الأولى: ابدأ بالحد الأدنى الذي يشتغل، ولا تنتظر أن يكتمل ${i} قبل أن تنشر أول نسخة.`,
      visual: `بطاقة نصية كبيرة تحمل الرقم ١، وخلفية بلون العلامة`,
    }),
    tip2: () => ({
      text: `النصيحة الثانية: قِس شيئًا واحدًا فقط، واعرف هل تحسّن أم لا قبل أن تضيف أي شيء جديد.`,
      visual: `لقطة شاشة أو رسم بسيط لرقم واحد يتغيّر أمام العين`,
    }),
    tip3: () => ({
      text: `النصيحة الثالثة: كرّر ما نجح ثلاث مرات قبل أن تجرّب فكرة أخرى، فالاستمرار يعطيك بيانات حقيقية.`,
      visual: `ثلاث لقطات متتالية بنفس التكوين تُظهر التكرار والتقدّم`,
    }),
    step1: (i) => ({
      text: `الخطوة الأولى: اكتب جملة واحدة تشرح ${i} لشخص لم يسمع به من قبل، هذه الجملة هي أساس كل شيء.`,
      visual: `دفتر ملاحظات أو شاشة كتابة، مع مؤشر يكتب الجملة الأولى`,
    }),
    step2: () => ({
      text: `الخطوة الثانية: قسّم العمل إلى ثلاث مهام صغيرة، وأنجز واحدة كل يوم بدل أن تنتظر الوقت المثالي.`,
      visual: `ثلاث بطاقات تُرتّب على الشاشة واحدة بعد الأخرى`,
    }),
    result: () => ({
      text: `بعد أسبوع واحد فقط، صار عندك شيء قابل للمشاركة، وهذا أفضل من خطة كاملة على الورق.`,
      visual: `لقطة نهائية للمنتج أو النتيجة، بإضاءة طبيعية وحركة كاميرا هادئة`,
    }),
    problem: () => ({
      text: `كل يوم نضيّع وقتًا في تفاصيل صغيرة، ثم ننسى الهدف الأساسي الذي بدأنا من أجله.`,
      visual: `مكتب مزدحم أو شاشة مليئة بالنوافذ، مع تركيز على التفاصيل الصغيرة`,
    }),
    solution: (i) => ({
      text: `لهذا بنينا حلًا واحدًا بسيطًا: كل ما يخص ${i} في مكان واحد، بخطوات واضحة من الفكرة إلى النشر.`,
      visual: `عرض المنتج على شاشة الهاتف، مع إبراز الواجهة الرئيسية`,
    }),
    proof: () => ({
      text: `والنتيجة ظهرت بسرعة: وقت أقل في التنظيم، ووقت أكبر في الإبداع، وهذا ما يهم فعلًا.`,
      visual: `أرقام أو مقارنة بسيطة بين قبل وبعد، بخط عريض وتباين عالٍ`,
    }),
    offer: () => ({
      text: `اليوم يمكنك تجربته بنفسك، بدون تعقيد وبدون أدوات إضافية.`,
      visual: `لقطة قريبة على زر البدء مع مساحة بيضاء حوله`,
    }),
  },
  fr: {
    hook: (i) => ({
      text: `${i} : voici l'essentiel en moins d'une minute, sans détour.`,
      visual: `Plan serré sur le visage, arrière-plan sobre, titre en gros caractères : ${i}`,
    }),
    context: (i) => ({
      text: `Tout a commencé par une petite idée autour de ${i}, devenue aujourd'hui une habitude quotidienne.`,
      visual: `Plans d'ambiance pour poser le contexte, lumière chaude`,
    }),
    turn: () => ({
      text: `Mais tout s'est compliqué au moment de passer à l'échelle : chaque étape demandait du temps et des ressources.`,
      visual: `Plan large puis gros plan sur le détail qui change tout`,
    }),
    resolve: () => ({
      text: `La solution était de changer l'ordre : commencer par le résultat, expliquer le chemin ensuite.`,
      visual: `Comparaison avant / après en deux couleurs, texte lisible`,
    }),
    cta: () => ({
      text: `Dites-moi en commentaire par où vous commenceriez, et gardez cette vidéo pour plus tard.`,
      visual: `Plan final calme avec un espace pour le texte et l'appel à l'action`,
    }),
    tip1: (i) => ({
      text: `Premier conseil : commencez par la version minimale qui fonctionne, sans attendre que ${i} soit parfait.`,
      visual: `Carte titre avec le chiffre 1 en grand sur fond coloré`,
    }),
    tip2: () => ({
      text: `Deuxième conseil : ne mesurez qu'un seul indicateur, et sachez s'il progresse avant d'ajouter quoi que ce soit.`,
      visual: `Capture d'écran ou schéma simple avec un chiffre qui évolue`,
    }),
    tip3: () => ({
      text: `Troisième conseil : répétez ce qui marche trois fois avant de tester autre chose.`,
      visual: `Trois plans successifs avec la même composition`,
    }),
    step1: (i) => ({
      text: `Étape une : écrivez une phrase qui explique ${i} à quelqu'un qui n'en a jamais entendu parler.`,
      visual: `Carnet ou écran d'écriture, la première phrase s'affiche`,
    }),
    step2: () => ({
      text: `Étape deux : découpez le travail en trois petites tâches, une par jour.`,
      visual: `Trois cartes qui s'alignent une à une à l'écran`,
    }),
    result: () => ({
      text: `En une semaine, vous avez déjà quelque chose à partager : mieux qu'un plan parfait sur le papier.`,
      visual: `Plan final sur le résultat, lumière naturelle, mouvement lent`,
    }),
    problem: () => ({
      text: `Chaque jour, on perd du temps sur des détails et on oublie l'objectif de départ.`,
      visual: `Bureau encombré ou écran saturé de fenêtres`,
    }),
    solution: (i) => ({
      text: `Alors on a construit une seule solution : tout ce qui concerne ${i} au même endroit, de l'idée à la publication.`,
      visual: `Le produit sur un téléphone, interface principale mise en avant`,
    }),
    proof: () => ({
      text: `Le résultat est immédiat : moins de temps à organiser, plus de temps à créer.`,
      visual: `Chiffres ou comparaison avant / après, fort contraste`,
    }),
    offer: () => ({
      text: `Aujourd'hui, vous pouvez l'essayer vous-même, sans installation compliquée.`,
      visual: `Gros plan sur le bouton de démarrage`,
    }),
  },
  en: {
    hook: (i) => ({
      text: `${i} — here is everything that matters in under a minute, no fluff.`,
      visual: `Tight shot on the speaker, clean background, bold title reading: ${i}`,
    }),
    context: (i) => ({
      text: `It started as a small idea about ${i}, and now it shows up everywhere.`,
      visual: `Wide contextual shots, warm light, small supporting text at the top`,
    }),
    turn: () => ({
      text: `Then scaling broke it: every new step needed time and resources we did not have.`,
      visual: `Wide shot moving into a close-up on the detail that matters`,
    }),
    resolve: () => ({
      text: `The fix was just reordering: start from the result, explain the path after.`,
      visual: `Before and after comparison, two colours, bold readable type`,
    }),
    cta: () => ({
      text: `Tell me in the comments where you would start, and save this for later.`,
      visual: `Calm closing shot with room for text and a clear call to action`,
    }),
    tip1: (i) => ({
      text: `Tip one: start with the smallest version that works, and stop waiting for ${i} to be perfect.`,
      visual: `Big number 1 card on a brand-coloured background`,
    }),
    tip2: () => ({
      text: `Tip two: measure one thing only, and know whether it moved before adding anything new.`,
      visual: `Screen recording or simple chart with a single number changing`,
    }),
    tip3: () => ({
      text: `Tip three: repeat what worked three times before testing another idea.`,
      visual: `Three matching shots that show repetition and progress`,
    }),
    step1: (i) => ({
      text: `Step one: write one sentence that explains ${i} to someone who never heard of it.`,
      visual: `Notebook or writing screen, the first sentence typed out`,
    }),
    step2: () => ({
      text: `Step two: cut the work into three small tasks, one per day.`,
      visual: `Three cards lining up on screen one after another`,
    }),
    result: () => ({
      text: `One week later you have something shareable, which beats a perfect plan on paper.`,
      visual: `Closing shot on the result, natural light, slow camera move`,
    }),
    problem: () => ({
      text: `Every day we lose time on small details and forget the goal we started with.`,
      visual: `Cluttered desk or a screen full of open windows`,
    }),
    solution: (i) => ({
      text: `So we built one simple place for everything about ${i}, from idea to publish.`,
      visual: `Product shown on a phone, main screen highlighted`,
    }),
    proof: () => ({
      text: `The result is immediate: less time organising, more time creating.`,
      visual: `Numbers or a simple before and after comparison, high contrast`,
    }),
    offer: () => ({
      text: `Today you can try it yourself, with no extra setup.`,
      visual: `Close-up on the start button with white space around it`,
    }),
  },
};

export const IDEAS: Record<Lang, string[]> = {
  ar: [
    'ثلاث عادات صغيرة تُغيّر صباحك',
    'كيف تختار فكرة مشروع في عشر دقائق',
    'أخطاء شائعة في التصوير بالهاتف',
    'طريقة بسيطة لتوفير ساعة كل يوم',
    'قصة مكتبة صغيرة أنقذت حيًا كاملًا',
    'كيف تحوّل ملاحظاتك إلى محتوى شهري',
  ],
  fr: [
    'Trois habitudes qui changent vos matinées',
    "Comment choisir une idée de projet en dix minutes",
    'Les erreurs classiques en vidéo mobile',
    'Une méthode simple pour gagner une heure par jour',
    "L'histoire d'une petite bibliothèque de quartier",
    'Transformer vos notes en un mois de contenu',
  ],
  en: [
    'Three small habits that change your morning',
    'How to pick a project idea in ten minutes',
    'Common mistakes in phone video',
    'A simple way to save an hour a day',
    'The story of a tiny neighbourhood library',
    'Turn your notes into a month of content',
  ],
};

export function clampIdea(idea: string): string {
  const clean = idea.replace(/\s+/g, ' ').trim();
  if (!clean) return 'فكرة جديدة';
  return clean.length > 90 ? `${clean.slice(0, 87).trim()}…` : clean;
}

export interface DraftInput {
  idea: string;
  lang: Lang;
  template: Template;
  seconds: number;
}

export function generateScenes({ idea, lang, template, seconds }: DraftInput): Scene[] {
  const roles = ROLES[template];
  const weights = WEIGHTS[template];
  const keyword = clampIdea(idea);
  const copy = COPY[lang];
  return roles.map((role, i) => {
    const base = copy[role](keyword);
    const target = Math.max(2, Math.round(seconds * weights[i] * 10) / 10);
    return {
      id: newId('sc'),
      text: base.text,
      visual: base.visual,
      seconds: target,
      motion: (['in', 'out', 'left', 'right', 'in'] as const)[i % 5],
    };
  });
}

const GENERIC_TAGS: Record<Lang, string[]> = {
  ar: ['#ريلز', '#محتوى', '#سلسلة', '#صناعة_المحتوى'],
  fr: ['#reels', '#contenu', '#serie', '#creation'],
  en: ['#reels', '#content', '#series', '#creator'],
};

const TEMPLATE_TAGS: Record<Lang, Record<Template, string>> = {
  ar: { story: '#قصة', tips: '#نصائح', howto: '#خطوات', promo: '#منتج' },
  fr: { story: '#histoire', tips: '#conseils', howto: '#etapes', promo: '#produit' },
  en: { story: '#story', tips: '#tips', howto: '#howto', promo: '#product' },
};

function keywords(text: string): string[] {
  const stop = new Set(['في', 'من', 'على', 'عن', 'إلى', 'هذا', 'هذه', 'كيف', 'the', 'and', 'for', 'with', 'les', 'des', 'une', 'pour', 'dans']);
  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter((word) => word.length >= 4 && !stop.has(word.toLowerCase()))
    .slice(0, 3);
}

export function buildMeta(project: Project, seriesName?: string): PublishMeta {
  const title = clampIdea(project.title);
  const hashtags = new Set<string>([
    TEMPLATE_TAGS[project.lang][project.template],
    ...keywords(project.idea).map((word) => `#${word}`),
    ...GENERIC_TAGS[project.lang],
  ]);
  if (seriesName && seriesName.trim()) {
    hashtags.add(`#${seriesName.trim().replace(/\s+/g, '_')}`);
  }
  const hooks: Record<Lang, string> = {
    ar: 'خلاصة سريعة في أقل من دقيقة — من غير حشو.',
    fr: "L'essentiel en moins d'une minute, sans blabla.",
    en: 'The short version in under a minute, no filler.',
  };
  const lists: Record<Lang, string> = { ar: 'في هذا الفيديو:', fr: 'Dans cette vidéo :', en: 'In this video:' };
  const ctas: Record<Lang, string> = {
    ar: 'احفظ الفيديو وشاركنا رأيك في التعليقات.',
    fr: 'Enregistrez la vidéo et dites-moi ce que vous en pensez.',
    en: 'Save the video and tell me what you think.',
  };
  const bullets = project.scenes
    .slice(1, 5)
    .map((scene) => `• ${scene.text.replace(/\s+/g, ' ').slice(0, 70).trim()}…`)
    .join('\n');
  const tags = Array.from(hashtags).slice(0, 8).join(' ');

  const description = [hooks[project.lang], '', lists[project.lang], bullets, '', ctas[project.lang], '', tags]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n')
    .trim();

  const metaTitle = title.length > 62 ? `${title.slice(0, 59).trim()}…` : title;
  return { title: metaTitle, description, hashtags: Array.from(hashtags).slice(0, 8) };
}

export function publishText(meta: PublishMeta): string {
  return `${meta.title}\n\n${meta.description}`;
}

export function langDir(lang: Lang): 'rtl' | 'ltr' {
  return LANGS.find((l) => l.id === lang)?.dir ?? 'rtl';
}

export function speechLang(lang: Lang): string {
  return LANGS.find((l) => l.id === lang)?.locale ?? 'ar-MA';
}
