export function grokKey(): string;
export const GROK_MODELS: string[];
export function startGrokVideo(input: {
  prompt: string;
  duration?: number;
  aspect?: string;
  model?: string;
}): Promise<{ requestId: string; model: string; duration: number }>;
export function getGrokVideo(id: string): Promise<{
  status: 'pending' | 'done' | 'failed';
  url: string | null;
  progress: number | null;
  error: string | null;
}>;
export function proxyGrokVideo(url: string): Promise<{ status: number; response?: Response; error?: string }>;
