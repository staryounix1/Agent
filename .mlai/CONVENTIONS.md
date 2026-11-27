# Conventions

## Guards (added after a mistake repeated)
- Before calling UI work done, render it in the browser at 390px and 1280px and check overflow, clipped text, overlap and contrast.

## Providers (mashhad)
- Free, no-key path = Pollinations only: text at `https://text.pollinations.ai/openai` (OpenAI-compatible POST, ~4s, 1 reply per 45s per IP, HTTP 402 `Retry after Ns`), images at `https://image.pollinations.ai/prompt`.
- Default text provider is `pollinations-text`; any provider error falls back to the local templates, so the flow never dead-ends. Settings has «شغّل المجاني» = free text + free images + local voice/video.
- Provider calls go through `fetchWithTimeout` in `src/lib/ai.ts` (30s text, 90s images). Do not add raw `fetch` without a timeout.

## Verification
- The workspace preview browser has no external network (even api.github.com fails), so in-preview provider calls always fall back. Verify provider logic by bundling `src/lib/ai.ts` with esbuild and calling it from node, and CORS with `curl -X OPTIONS`. Say plainly that in-browser provider calls are not verifiable here.
- Before finishing, stop the servers and background commands you started; long-lived work goes in a job or the preview.
