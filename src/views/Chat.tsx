import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { Button, Icon, Progress, useToast } from '../ui';
import type { Project, PublishMeta, Scene, Template, View } from '../types';
import { buildMeta, clampIdea, generateScenes, publishText } from '../lib/script';
import { estimateSeconds, formatClock } from '../lib/timeline';
import { assetImage, assetUrl, getAsset, newId, putAsset } from '../lib/storage';
import { copyText } from '../lib/clipboard';
import { dimensionsFor, downloadBlob, exportVideo, pickVideoFormat, slugify } from '../lib/exporter';
import { sceneCardBlob } from '../lib/cards';
import type { VisualFrame } from '../lib/render';
import { type ChatStep, TEMPLATE_LABEL, ideasFor, inferTemplate, parseCommand, parseSeconds } from '../lib/chat';
import { track } from '../lib/analytics';

const CHAT_KEY = 'mashhad.chat.v1';

interface Message {
  id: string;
  role: 'ai' | 'me';
  text?: string;
  card?: 'script' | 'video' | 'error';
  chips?: string[];
}

interface Draft {
  template: Template;
  idea: string;
  seconds: number;
  aspect: '9:16' | '1:1' | '16:9';
  lang: 'ar' | 'fr' | 'en';
}

interface Saved {
  step: ChatStep;
  messages: Message[];
  draft: Draft;
  scenes: Scene[];
  round: number;
  projectId: string | null;
  video: { assetId: string; name: string } | null;
  meta: PublishMeta | null;
}

const EMPTY_DRAFT: Draft = { template: 'tips', idea: '', seconds: 30, aspect: '9:16', lang: 'ar' };

function welcome(): Message {
  return {
    id: newId('ms'),
    role: 'ai',
    text:
      'سلام! أنا مساعد مشهد. غادي نصاوبو معاك فيديو كامل: نختارو النوع، نلقاو فكرة، نكتبو السكريبت، ومن بعد نصدرّو ليك MP4 بالترجمة والموسيقى. غادي يكون عمودي 9:16 بالعربية. شنو نوع الفيديو؟',
    chips: ['قصة', 'نصائح', 'خطوات', 'منتج'],
  };
}

function scriptMessage(text: string): Message {
  return {
    id: newId('ms'),
    role: 'ai',
    text,
    card: 'script',
    chips: ['اصنع الفيديو', 'أقصر', 'أفكار أخرى'],
  };
}

export function ChatView({ onOpen }: { onOpen: (view: View) => void }) {
  const { state, createProject, updateProject, createSeries, selectProject, setStage } = useStore();
  const toast = useToast();

  const [step, setStep] = useState<ChatStep>('template');
  const [messages, setMessages] = useState<Message[]>(() => [welcome()]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [round, setRound] = useState(0);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ratio, setRatio] = useState(0);
  const [progressSeconds, setProgressSeconds] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [video, setVideo] = useState<{ url: string; name: string; assetId: string } | null>(null);
  const [meta, setMeta] = useState<PublishMeta | null>(null);
  const [restored, setRestored] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        if (saved.messages?.length) {
          setMessages(saved.messages);
          setStep(saved.step === 'producing' ? 'script' : saved.step);
          setDraft(saved.draft ?? EMPTY_DRAFT);
          setScenes(saved.scenes ?? []);
          setRound(saved.round ?? 0);
          setProjectId(saved.projectId ?? null);
          setMeta(saved.meta ?? null);
          if (saved.video) {
            void assetUrl(saved.video.assetId).then((url) => {
              if (url) setVideo({ url, name: saved.video!.name, assetId: saved.video!.assetId });
            });
          }
        }
      }
    } catch {
      /* نبدأ من جديد */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    const saved: Saved = {
      step: step === 'producing' ? 'script' : step,
      messages,
      draft,
      scenes,
      round,
      projectId,
      video: video ? { assetId: video.assetId, name: video.name } : null,
      meta,
    };
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(saved));
    } catch {
      /* المتصفح ممتلئ */
    }
  }, [restored, step, messages, draft, scenes, round, projectId, video, meta]);

  useEffect(() => {
    const box = endRef.current?.closest('.chat__scroll');
    if (box instanceof HTMLElement) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [messages.length, step, busy]);

  const push = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const produceVideo = useCallback(
    async (nextScenes: Scene[]) => {
      const format = pickVideoFormat();
      if (!format) {
        push({
          id: newId('ms'),
          role: 'ai',
          text: 'هذا المتصفح ما كيسجلش الفيديو. جرّب Chrome ولا Edge.',
          card: 'error',
          chips: ['اصنع الفيديو'],
        });
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas || nextScenes.length === 0) return;

      setBusy(true);
      setStep('producing');
      setRatio(0);
      setProgressSeconds(0);

      try {
        const series = state.series[0] ?? createSeries('سلسلة المساعد');
        const project = createProject({
          title: draft.idea,
          idea: draft.idea,
          seriesId: series.id,
          lang: draft.lang,
          aspect: draft.aspect,
          template: draft.template,
          targetSeconds: draft.seconds,
        });
        const publishMeta = buildMeta({ ...project, scenes: nextScenes }, series.name);
        const { w, h } = dimensionsFor(project);

        const imageIds = new Map<string, string>();
        for (const [index, scene] of nextScenes.entries()) {
          const id = newId('im');
          await putAsset({
            id,
            kind: 'image',
            name: `${scene.id}.svg`,
            mime: 'image/svg+xml',
            blob: sceneCardBlob(index, w, h),
            width: w,
            height: h,
            createdAt: Date.now(),
          });
          imageIds.set(scene.id, id);
        }

        const finalScenes: Scene[] = nextScenes.map((scene) => ({
          ...scene,
          imageId: imageIds.get(scene.id),
        }));
        const finalProject: Project = {
          ...project,
          scenes: finalScenes,
          stage: 'assets',
          captions: { enabled: true, size: 1 },
          music: { source: 'builtin', volume: 0.32 },
          meta: publishMeta,
        };
        updateProject(project.id, () => finalProject);
        selectProject(project.id);
        setProjectId(project.id);
        setMeta(publishMeta);

        const visuals: Record<number, VisualFrame> = {};
        for (const [index, scene] of finalScenes.entries()) {
          const image = scene.imageId ? await assetImage(scene.imageId) : null;
          if (image) {
            visuals[index] = {
              kind: 'image',
              source: image,
              width: image.naturalWidth || w,
              height: image.naturalHeight || h,
            };
          }
        }

        track('export_started', { project_id: project.id, aspect: draft.aspect, seconds: draft.seconds });
        const output = await exportVideo({
          project: finalProject,
          seriesName: series.name,
          canvas,
          getVisual: (index) => visuals[index] ?? null,
          audioBlobs: {},
          audioDurations: {},
          onProgress: (value, seconds) => {
            setRatio(value);
            setProgressSeconds(seconds);
          },
        });

        const assetId = newId('vd');
        await putAsset({
          id: assetId,
          kind: 'video',
          name: output.filename,
          mime: output.format.mime,
          blob: output.blob,
          duration: output.duration,
          createdAt: Date.now(),
        });
        setStage(project.id, 'ready');
        setVideo({ url: URL.createObjectURL(output.blob), name: output.filename, assetId });
        setStep('done');
        track('export_completed', {
          project_id: project.id,
          mime: output.format.mime,
          is_mp4: output.format.isMp4,
          bytes: output.blob.size,
          seconds: Math.round(output.duration),
        });
        push({
          id: newId('ms'),
          role: 'ai',
          text: `ها هو الفيديو: ${finalScenes.length} مشاهد، ${formatClock(output.duration)}، ${output.format.label}. الترجمة والموسيقى داخلو، وما فيهش تعليق صوتي — تقدر تسجل صوتك من التحرير اليدوي.`,
          card: 'video',
          chips: ['تحرير يدوي', 'فيديو جديد'],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'تعذّر التصدير';
        toast(message, 'error');
        setStep('script');
        push({
          id: newId('ms'),
          role: 'ai',
          text: `توقف التصدير: ${message}`,
          card: 'error',
          chips: ['اصنع الفيديو'],
        });
      } finally {
        setBusy(false);
      }
    },
    [createProject, createSeries, draft, push, selectProject, setStage, state.series, toast, updateProject],
  );

  const rebuild = useCallback(
    (seconds: number) => {
      const next = generateScenes({ idea: draft.idea, lang: draft.lang, template: draft.template, seconds });
      setScenes(next);
      setDraft((d) => ({ ...d, seconds }));
      return next;
    },
    [draft.idea, draft.lang, draft.template],
  );

  const reset = useCallback(() => {
    setStep('template');
    setMessages([welcome()]);
    setDraft(EMPTY_DRAFT);
    setScenes([]);
    setRound(0);
    setProjectId(null);
    setVideo(null);
    setMeta(null);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.replace(/\s+/g, ' ').trim();
      if (!text || busy) return;
      setInput('');
      push({ id: newId('ms'), role: 'me', text });
      track('chat_message', { step, chars: text.length });

      if (step === 'template') {
        const template = inferTemplate(text);
        if (template) {
          setDraft((d) => ({ ...d, template }));
          setStep('idea');
          push({
            id: newId('ms'),
            role: 'ai',
            text: `مزيان، ${TEMPLATE_LABEL[template]}. شنو الموضوع؟ كتب الفكرة بكلماتك ولا اختار وحدة من هذي:`,
            chips: [...ideasFor(template, draft.lang, 0), 'أعطني أفكار'],
          });
          return;
        }
        const idea = clampIdea(text);
        setDraft((d) => ({ ...d, template: 'tips', idea }));
        setStep('length');
        push({
          id: newId('ms'),
          role: 'ai',
          text: `خديت الفكرة «${idea}» وغادي نبنيها على شكل نصائح. شحال الوقت؟`,
          chips: ['20 ثانية', '30 ثانية', '45 ثانية', '60 ثانية'],
        });
        return;
      }

      if (step === 'idea') {
        if (text === 'أعطني أفكار' || /أفكار أخرى|اقترح/.test(text)) {
          const next = round + 1;
          setRound(next);
          push({
            id: newId('ms'),
            role: 'ai',
            text: 'ها أفكار جديدة — اختار وحدة ولا كتب فكرتك:',
            chips: ideasFor(draft.template, draft.lang, next),
          });
          return;
        }
        const idea = clampIdea(text);
        if (idea.length < 4) {
          push({
            id: newId('ms'),
            role: 'ai',
            text: 'كتب الفكرة ف جملة قصيرة، ولا اختار فكرة من اللي فوق.',
            chips: ideasFor(draft.template, draft.lang, round),
          });
          return;
        }
        setDraft((d) => ({ ...d, idea }));
        setStep('length');
        push({
          id: newId('ms'),
          role: 'ai',
          text: `تمام: «${idea}». شحال الوقت؟`,
          chips: ['20 ثانية', '30 ثانية', '45 ثانية', '60 ثانية'],
        });
        return;
      }

      if (step === 'length') {
        const seconds = parseSeconds(text) ?? 30;
        setDraft((d) => ({ ...d, seconds }));
        const next = generateScenes({ idea: draft.idea, lang: draft.lang, template: draft.template, seconds });
        setScenes(next);
        setStep('script');
        push(
          scriptMessage(
            `هذا السكريبت: ${next.length} مشاهد في حوالي ${seconds} ثانية. تقدر تبدّل: كتب «مشهد 2: النص الجديد». ملي يعجبك، اضغط اصنع الفيديو.`,
          ),
        );
        return;
      }

      if (step === 'script') {
        const command = parseCommand(text);
        if (command.kind === 'produce') {
          await produceVideo(scenes);
          return;
        }
        if (command.kind === 'shorter' || command.kind === 'longer') {
          const nextSeconds = command.kind === 'shorter'
            ? Math.max(15, draft.seconds - 8)
            : Math.min(90, draft.seconds + 8);
          const next = rebuild(nextSeconds);
          push(scriptMessage(`قصّرت ولا طوّلت: دابا ${nextSeconds} ثانية و${next.length} مشاهد.`));
          return;
        }
        if (command.kind === 'ideas') {
          setStep('idea');
          const next = round + 1;
          setRound(next);
          push({
            id: newId('ms'),
            role: 'ai',
            text: 'ما مشكلش — نبدلو الفكرة. اختار وحدة من هذي ولا كتب فكرتك:',
            chips: ideasFor(draft.template, draft.lang, next),
          });
          return;
        }
        if (command.kind === 'sceneText' || command.kind === 'sceneVisual') {
          const index = command.index - 1;
          if (index < 0 || index >= scenes.length) {
            push({
              id: newId('ms'),
              role: 'ai',
              text: `ما كاينش مشهد ${command.index}. عندك ${scenes.length} مشاهد.`,
              chips: ['اصنع الفيديو'],
            });
            return;
          }
          const next = scenes.map((scene, i) => {
            if (i !== index) return scene;
            if (command.kind === 'sceneVisual') return { ...scene, visual: command.value };
            return {
              ...scene,
              text: command.value,
              seconds: Math.max(2, Math.round(estimateSeconds(command.value, draft.lang) * 10) / 10),
            };
          });
          setScenes(next);
          push(scriptMessage(`بدّلت المشهد ${command.index}. ها السكريبت المحدّث:`));
          return;
        }
        if (command.kind === 'rewrite') {
          const idea = clampIdea(command.value);
          const next = generateScenes({ idea, lang: draft.lang, template: draft.template, seconds: draft.seconds });
          setDraft((d) => ({ ...d, idea }));
          setScenes(next);
          push(scriptMessage(`بدّلت الفكرة لـ«${idea}» وعاودت كتبت المشاهد:`));
          return;
        }
        push({
          id: newId('ms'),
          role: 'ai',
          text: 'تقدر تقول: «اصنع الفيديو»، «أقصر»، «أفكار أخرى»، ولا «مشهد 2: النص الجديد».',
          chips: ['اصنع الفيديو', 'أقصر', 'أفكار أخرى'],
        });
        return;
      }

      if (step === 'done') {
        if (/تحرير|يدوي|أدوات|ادوات/.test(text)) {
          onOpen('edit');
          return;
        }
        if (/فيديو جديد|جديد/.test(text)) {
          reset();
          return;
        }
        push({
          id: newId('ms'),
          role: 'ai',
          text: 'الفيديو فوق جاهز. تقدر تبدا واحد جديد، ولا تكمّل هذا فالتحرير اليدوي (صوت، صور، ترجمة).',
          chips: ['تحرير يدوي', 'فيديو جديد'],
        });
      }
    },
    [busy, draft, onOpen, produceVideo, push, rebuild, reset, round, scenes, step],
  );

  const copy = async (label: string, value: string) => {
    const ok = await copyText(value);
    toast(ok ? `نسخت ${label}` : 'تعذّر النسخ', ok ? 'ok' : 'error');
  };

  const downloadVideo = async () => {
    if (!video) return;
    const asset = await getAsset(video.assetId);
    if (!asset) {
      toast('ما لقيتش ملف الفيديو', 'error');
      return;
    }
    downloadBlob(asset.blob, video.name || `${slugify(draft.idea)}.mp4`);
  };

  const totalSeconds = scenes.reduce((sum, scene) => sum + scene.seconds, 0);
  const last = messages[messages.length - 1];
  const chips = busy || step === 'producing' ? [] : last?.chips ?? [];

  return (
    <div className="chat">
      <div className="chat__scroll">
        <div className="chat__inner">
          {messages.map((message) => {
            const isAi = message.role === 'ai';
            return (
              <div key={message.id} className={`chat__row ${isAi ? '' : 'chat__row--me'}`}>
                {isAi ? (
                  <span className="chat__avatar" aria-hidden="true">
                    <Icon name="sparkles" size={15} />
                  </span>
                ) : null}
                <div className={`chat__bubble ${message.card ? 'chat__bubble--wide' : ''}`}>
                  {message.text ? <p className="chat__text">{message.text}</p> : null}

                  {message.card === 'script' ? (
                    <ol className="chat__script">
                      {scenes.map((scene, i) => (
                        <li key={scene.id} className="chat__scriptrow">
                          <span className="chat__scriptnum num">{i + 1}</span>
                          <div>
                            <p className="chat__scripttext">{scene.text}</p>
                            <p className="chat__scriptvisual">{scene.visual}</p>
                          </div>
                          <span className="chat__scriptsec num">{scene.seconds.toFixed(1)}ث</span>
                        </li>
                      ))}
                      <li className="chat__scripttotal">
                        <span className="small muted">المجموع</span>
                        <span className="num">{formatClock(totalSeconds)}</span>
                      </li>
                    </ol>
                  ) : null}

                  {message.card === 'video' && video ? (
                    <div className="chat__video">
                      <div className="chat__stage">
                        <video className="chat__player" src={video.url} controls playsInline preload="metadata" />
                      </div>
                      <div className="chat__actions">
                        <Button variant="primary" size="sm" icon="download" onClick={downloadVideo}>
                          تنزيل الفيديو
                        </Button>
                        {projectId ? (
                          <Button size="sm" icon="film" onClick={() => onOpen('edit')}>
                            فتح في المونتاج
                          </Button>
                        ) : null}
                      </div>
                      {meta ? (
                        <div className="chatmeta">
                          <div className="chatmeta__head">
                            <span className="chatmeta__label">العنوان</span>
                            <Button size="sm" variant="quiet" icon="copy" onClick={() => copy('العنوان', meta.title)}>
                              نسخ
                            </Button>
                          </div>
                          <p className="chatmeta__value">{meta.title}</p>
                          <div className="chatmeta__head">
                            <span className="chatmeta__label">الوصف والهاشتاغ</span>
                            <Button
                              size="sm"
                              variant="quiet"
                              icon="copy"
                              onClick={() => copy('نص النشر', publishText(meta))}
                            >
                              نسخ
                            </Button>
                          </div>
                          <pre className="chatmeta__desc">{publishText(meta)}</pre>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                </div>
              </div>
            );
          })}

          {step === 'producing' ? (
            <div className="chat__row">
              <span className="chat__avatar" aria-hidden="true">
                <Icon name="sparkles" size={15} />
              </span>
              <div className="chat__bubble chat__bubble--wide">
                <p className="chat__text">
                  كنصدّر الفيديو… {Math.round(ratio * 100)}% ({formatClock(progressSeconds)} / {formatClock(totalSeconds)})
                </p>
                <Progress value={ratio} label="تقدّم التصدير" />
                <p className="chat__hint">
                  التصدير كيتم في الوقت الحقيقي، ما تسدش التبويب حتى يسالي.
                </p>
              </div>
            </div>
          ) : null}

          <div ref={endRef} />
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="chat__chips">
          {chips.map((chip) => (
            <button key={chip} type="button" className="chip" onClick={() => void send(chip)} disabled={busy}>
              {chip}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="chat__composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <input
          className="chat__input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={busy ? 'كنصدّر الفيديو…' : 'كتب هنا…'}
          aria-label="رسالتك"
          disabled={busy}
        />
        <button
          type="submit"
          className="chat__send"
          disabled={busy || !input.trim()}
          aria-label="إرسال"
        >
          <Icon name="send" size={18} />
        </button>
      </form>

      <canvas ref={canvasRef} className="chat__canvas" width={1080} height={1920} aria-hidden="true" />
    </div>
  );
}
