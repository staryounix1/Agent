# Conventions

## Guards (added after a mistake repeated)
- Before calling UI work done, render it in the browser at 390px and 1280px and check overflow, clipped text, overlap and contrast. A text overlay on the video stage is by design, not an overlap.

## Providers (mashhad)
- Free, no-key path = Pollinations only: text at `https://text.pollinations.ai/openai` (OpenAI-compatible POST, ~4s, 1 reply per 45s per IP, HTTP 402 `Retry after Ns`), images at `https://image.pollinations.ai/prompt`.
- Default text provider is `pollinations-text`; any provider error falls back to the local templates, so the flow never dead-ends. Settings has «شغّل المجاني» = free text + free images + local voice/video.
- Provider calls go through `fetchWithTimeout` in `src/lib/ai.ts` (30s text, 90s images). Do not add raw `fetch` without a timeout.

## Verification
- The workspace preview browser has no external network (even api.github.com fails), so in-preview provider calls always fall back. Verify provider logic by bundling `src/lib/ai.ts` with esbuild and calling it from node, and CORS with `curl -X OPTIONS`. Say plainly that in-browser provider calls are not verifiable here.
- Before finishing, stop the servers and background commands you started; long-lived work goes in a job or the preview.

## E2E (Playwright, `tests/e2e/chat.spec.ts`)
- In CI mode (`CI` is set in this sandbox) Playwright will not reuse a dev server on 3100; kill any leftover `vite` from an earlier turn first, or the run fails instantly with "already used".
- Assert progress on `role=status` with any named stage, never one transient stage: when the image provider is unreachable the images stage is skipped, so `getByText('نجيب صور المشاهد')` is racy.
- The project store persists to localStorage in an effect after the render; after an export, poll (`expect.poll`) for the saved export instead of reading once as soon as the download button appears.
- UI note: `.chat__stage` is the 300px video box. The progress status line uses `.chat__stage-note`; do not reuse the stage class for text.
