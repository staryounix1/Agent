export const MAX_TEXT: number;
export const MAX_CHUNK: number;
export const WINDOW_MS: number;
export const MAX_CALLS: number;
export function chunkText(text: string, size?: number): string[];
export function allow(ip: string, now?: number): boolean;
export function resetLimits(): void;
export function synthesizeFree(
  text: string,
  lang?: string,
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<{ buffer: Buffer; contentType: string }>;
