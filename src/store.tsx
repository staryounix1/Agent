import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState, Aspect, ExportRecord, Lang, Project, Scene, Series, Stage, Template } from './types';
import { STAGES } from './types';
import { loadState, saveState, newId, putAsset, deleteAssets, allAssets } from './lib/storage';
import { assetIdsOfProject, exportsToDrop, orphanAssetIds } from './lib/assets';
import { audioSeconds } from './lib/audio';
import { probeVideo } from './lib/visuals';
import { buildMeta, generateScenes } from './lib/script';
import { exportBackup, importBackup } from './lib/backup';
import { track } from './lib/analytics';

export interface NewProjectInput {
  title: string;
  idea: string;
  seriesId: string;
  lang: Lang;
  aspect: Aspect;
  template: Template;
  targetSeconds: number;
}

interface StoreApi {
  state: AppState;
  project: Project | null;
  updateProject: (id: string, fn: (project: Project) => Project) => void;
  createSeries: (name: string) => Series;
  createProject: (input: NewProjectInput) => Project;
  selectProject: (id: string | null) => void;
  deleteProject: (id: string) => void;
  deleteSeries: (id: string) => void;
  addExport: (projectId: string, record: ExportRecord) => void;
  cleanupStorage: () => Promise<number>;
  exportBackupFile: () => Promise<{ blob: Blob; skipped: number }>;
  importBackupFile: (file: File) => Promise<{ projects: number; assets: number; skipped: number }>;
  setStage: (id: string, stage: Stage) => void;
  saveSceneImage: (projectId: string, sceneId: string, file: Blob, name: string) => Promise<void>;
  saveSceneVideo: (projectId: string, sceneId: string, file: Blob, name: string, fromGrok?: boolean) => Promise<void>;
  saveSceneAudio: (projectId: string, sceneId: string, blob: Blob, name: string, source: 'mic' | 'upload') => Promise<void>;
  saveMusic: (projectId: string, blob: Blob, name: string) => Promise<void>;
  duplicateProject: (id: string) => void;
}

const StoreContext = createContext<StoreApi | null>(null);

function stageIndex(stage: Stage): number {
  return STAGES.findIndex((s) => s.id === stage);
}

export function advanceTo(project: Project, stage: Stage): Project {
  return stageIndex(project.stage) >= stageIndex(stage) ? project : { ...project, stage };
}

function withUpdate(project: Project): Project {
  return { ...project, updatedAt: Date.now() };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;
  const stateProjectsRef = useRef<Project[]>(state.projects);
  stateProjectsRef.current = state.projects;
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveState(state), 180);
    return () => window.clearTimeout(timer.current);
  }, [state]);

  const updateProject = useCallback((id: string, fn: (project: Project) => Project) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((project) => (project.id === id ? withUpdate(fn(project)) : project)),
    }));
  }, []);

  const createSeries = useCallback((name: string) => {
    const series: Series = { id: newId('sr'), name: name.trim() || 'سلسلة جديدة', createdAt: Date.now() };
    setState((prev) => ({ ...prev, series: [...prev.series, series] }));
    track('series_created', { name: series.name });
    return series;
  }, []);

  const createProject = useCallback((input: NewProjectInput) => {
    const scenes = generateScenes({
      idea: input.idea,
      lang: input.lang,
      template: input.template,
      seconds: input.targetSeconds,
    });
    const project: Project = {
      id: newId('pr'),
      seriesId: input.seriesId,
      title: input.title.trim() || input.idea.trim().slice(0, 60) || 'مشروع جديد',
      idea: input.idea,
      lang: input.lang,
      aspect: input.aspect,
      template: input.template,
      stage: 'script',
      targetSeconds: input.targetSeconds,
      scenes,
      captions: { enabled: true, size: 1 },
      music: { source: 'builtin', volume: 0.22 },
      meta: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      exportCount: 0,
    };
    setState((prev) => ({ ...prev, projects: [project, ...prev.projects], selectedId: project.id }));
    track('project_created', {
      template: input.template,
      lang: input.lang,
      aspect: input.aspect,
      target_seconds: input.targetSeconds,
      scenes: scenes.length,
    });
    track('script_generated', { source: 'generator', scenes: scenes.length, project_id: project.id });
    return project;
  }, []);

  const selectProject = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, selectedId: id }));
    if (id) track('project_opened', { project_id: id });
  }, []);

  const deleteProject = useCallback((id: string) => {
    const target = stateProjectsRef.current.find((p) => p.id === id);
    if (target) void deleteAssets(assetIdsOfProject(target));
    setState((prev) => ({
      ...prev,
      projects: prev.projects.filter((p) => p.id !== id),
      selectedId: prev.selectedId === id ? null : prev.selectedId,
    }));
  }, []);

  const deleteSeries = useCallback((id: string) => {
    for (const project of stateProjectsRef.current.filter((p) => p.seriesId === id))
      void deleteAssets(assetIdsOfProject(project));
    setState((prev) => ({
      ...prev,
      series: prev.series.filter((s) => s.id !== id),
      projects: prev.projects.filter((p) => p.seriesId !== id),
      selectedId: prev.projects.find((p) => p.id === prev.selectedId)?.seriesId === id ? null : prev.selectedId,
    }));
  }, []);

  /** يسجّل فيديو مصدرًا ويحذف الأقدم فوق السقف حتى لا تتراكم الميجابايتات. */
  const addExport = useCallback((projectId: string, record: ExportRecord) => {
    let dropped: string[] = [];
    updateProject(projectId, (project) => {
      const next: Project = {
        ...project,
        exportCount: project.exportCount + 1,
        exports: [...(project.exports ?? []), record],
      };
      dropped = exportsToDrop(next);
      return { ...next, exports: (next.exports ?? []).filter((item) => !dropped.includes(item.id)) };
    });
    if (dropped.length) void deleteAssets(dropped);
  }, [updateProject]);

  /** يمسح كل أصل لا يستعمله أي مشروع (بعد تنزيل الفيديو أو حذف مشاريع). */
  const cleanupStorage = useCallback(async (): Promise<number> => {
    const assets = await allAssets().catch(() => []);
    const orphans = orphanAssetIds(assets, stateProjectsRef.current);
    return deleteAssets(orphans);
  }, []);

  const exportBackupFile = useCallback(async () => {
    const { blob, skipped } = await exportBackup({
      version: 1,
      series: stateRef.current.series,
      projects: stateRef.current.projects,
      selectedId: null,
    });
    return { blob, skipped };
  }, []);

  const importBackupFile = useCallback(async (file: File) => {
    const raw = await file.text();
    const result = await importBackup(raw, stateRef.current);
    setState(result.state);
    return { projects: result.projects, assets: result.assets, skipped: result.skipped };
  }, []);

  const setStage = useCallback((id: string, stage: Stage) => {
    updateProject(id, (project) => ({ ...project, stage }));
  }, [updateProject]);

  const saveSceneImage = useCallback(async (projectId: string, sceneId: string, file: Blob, name: string) => {
    const id = newId('im');
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve({ width: 0, height: 0 });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
    await putAsset({
      id,
      kind: 'image',
      name,
      mime: file.type || 'image/jpeg',
      blob: file,
      width: dims.width,
      height: dims.height,
      createdAt: Date.now(),
    });
    updateProject(projectId, (project) => ({
      ...advanceTo(project, 'assets'),
      scenes: project.scenes.map((scene) => (scene.id === sceneId ? { ...scene, imageId: id } : scene)),
    }));
    track('visual_attached', { project_id: projectId, scene_id: sceneId, kind: 'image', bytes: file.size });
  }, [updateProject]);

  const saveSceneVideo = useCallback(async (
    projectId: string,
    sceneId: string,
    file: Blob,
    name: string,
    fromGrok = false,
  ) => {
    const id = newId('vi');
    const info = await probeVideo(file);
    await putAsset({
      id,
      kind: 'video',
      name,
      mime: file.type || 'video/mp4',
      blob: file,
      duration: info.duration,
      width: info.width,
      height: info.height,
      createdAt: Date.now(),
    });
    updateProject(projectId, (project) => ({
      ...advanceTo(project, 'assets'),
      scenes: project.scenes.map((scene) =>
        scene.id === sceneId
          ? {
              ...scene,
              videoId: id,
              videoSeconds: info.duration,
              videoFromGrok: fromGrok,
              seconds: info.duration ? Math.max(scene.seconds, Math.round((info.duration + 0.2) * 10) / 10) : scene.seconds,
            }
          : scene,
      ),
    }));
    track('visual_attached', {
      project_id: projectId,
      scene_id: sceneId,
      kind: 'video',
      seconds: Math.round(info.duration * 10) / 10,
      grok: fromGrok,
    });
  }, [updateProject]);

  const saveSceneAudio = useCallback(async (
    projectId: string,
    sceneId: string,
    blob: Blob,
    name: string,
    source: 'mic' | 'upload',
  ) => {
    const id = newId('au');
    const duration = await audioSeconds(blob);
    await putAsset({
      id,
      kind: 'audio',
      name,
      mime: blob.type || 'audio/webm',
      blob,
      duration,
      createdAt: Date.now(),
    });
    updateProject(projectId, (project) => ({
      ...advanceTo(project, 'assets'),
      scenes: project.scenes.map((scene) =>
        scene.id === sceneId
          ? { ...scene, audioId: id, audioSeconds: duration, voiceSource: source, seconds: Math.max(scene.seconds, duration + 0.25) }
          : scene,
      ),
    }));
    track('voice_attached', { project_id: projectId, scene_id: sceneId, seconds: duration, source });
  }, [updateProject]);

  const saveMusic = useCallback(async (projectId: string, blob: Blob, name: string) => {
    const id = newId('mu');
    await putAsset({ id, kind: 'audio', name, mime: blob.type || 'audio/mpeg', blob, createdAt: Date.now() });
    updateProject(projectId, (project) => ({ ...project, music: { ...project.music, source: 'upload', assetId: id } }));
  }, [updateProject]);

  const duplicateProject = useCallback((id: string) => {
    setState((prev) => {
      const source = prev.projects.find((p) => p.id === id);
      if (!source) return prev;
      const copy: Project = {
        ...source,
        id: newId('pr'),
        title: `${source.title} — نسخة`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        exportCount: 0,
        stage: source.stage === 'ready' ? 'edit' : source.stage,
        meta: null,
        scenes: source.scenes.map((scene: Scene) => ({ ...scene, id: newId('sc') })),
      };
      return { ...prev, projects: [copy, ...prev.projects], selectedId: copy.id };
    });
  }, []);

  const project = useMemo(
    () => state.projects.find((p) => p.id === state.selectedId) ?? null,
    [state.projects, state.selectedId],
  );

  const api = useMemo<StoreApi>(() => ({
    state,
    project,
    updateProject,
    createSeries,
    createProject,
    selectProject,
    deleteProject,
    deleteSeries,
    addExport,
    cleanupStorage,
    exportBackupFile,
    importBackupFile,
    setStage,
    saveSceneImage,
    saveSceneVideo,
    saveSceneAudio,
    saveMusic,
    duplicateProject,
  }), [state, project, updateProject, createSeries, createProject, selectProject, deleteProject, deleteSeries, addExport, cleanupStorage, exportBackupFile, importBackupFile, setStage, saveSceneImage, saveSceneVideo, saveSceneAudio, saveMusic, duplicateProject]);

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore خارج المزوّد');
  return ctx;
}

export function seriesName(state: AppState, seriesId: string): string {
  return state.series.find((s) => s.id === seriesId)?.name ?? 'بدون سلسلة';
}

export function projectMeta(project: Project, series?: string) {
  return project.meta ?? buildMeta(project, series);
}

export function projectDuration(project: Project): number {
  return project.scenes.reduce((sum, scene) => sum + (scene.audioSeconds && scene.audioSeconds > scene.seconds ? scene.audioSeconds + 0.25 : scene.seconds), 0);
}
