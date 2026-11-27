export declare const WINDOW_MS: number;
export declare const MAX_CALLS: number;
export declare const hits: Map<string, number[]>;

export interface GuardVerdict {
  ok: boolean;
  status?: number;
  error?: string;
  retryAfterMs?: number;
  remaining?: number;
}

export interface GuardRequest {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

export declare function clientIp(req: GuardRequest): string;
export declare function allowedOrigins(env?: Record<string, string | undefined>): string[];
export declare function originAllowed(origin: string, host: string, env?: Record<string, string | undefined>): boolean;
export declare function checkRate(
  store: Map<string, number[]>,
  ip: string,
  now: number,
  options?: { max?: number; windowMs?: number },
): { allowed: boolean; retryAfterMs: number; remaining: number };
export declare function authorize(
  req: GuardRequest,
  env?: Record<string, string | undefined>,
  now?: number,
  store?: Map<string, number[]>,
): GuardVerdict;
