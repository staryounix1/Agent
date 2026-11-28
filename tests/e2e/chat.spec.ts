import { expect, test, type Page } from '@playwright/test';

const STATE_KEY = 'mashhad.state.v1';

async function projects(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return [] as { id: string; exports?: unknown[]; scenes: { audioId?: string }[] }[];
    return JSON.parse(raw).projects ?? [];
  }, STATE_KEY);
}

/** يدخل فكرة، يختار المدة، ويوصل لبطاقة السكريبت. */
async function scriptCard(page: Page, idea: string, seconds = 20) {
  const box = page.getByRole('textbox', { name: 'رسالتك' });
  await box.fill(idea);
  await page.getByRole('button', { name: 'إرسال' }).click();

  // نص فيه كلمة قالب («نصائح»، «قصة»…) يختار القالب ويسأل عن الموضوع أولًا.
  await expect(page.getByText(/شنو الموضوع؟|شحال الوقت؟/)).toBeVisible();
  if (await page.getByText('شنو الموضوع؟').isVisible()) {
    await box.fill(idea);
    await page.getByRole('button', { name: 'إرسال' }).click();
  }

  await expect(page.getByText('شحال الوقت؟')).toBeVisible();
  await page.getByRole('button', { name: `${seconds} ثانية` }).click();
  await expect(page.getByText('المجموع')).toBeVisible();
}

test.describe('chat to video', () => {
  test('idea → script → rendered video with a download control', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await scriptCard(page, 'ثلاث نصائح للقهوة الصباحية');

    const scenes = await page.locator('.chat__scriptrow').count();
    expect(scenes).toBeGreaterThanOrEqual(3);

    await page.getByRole('button', { name: 'اصنع الفيديو' }).first().click();
    // سطر المرحلة الحالية: التسمية تعتمد على المزوّد المتاح (قد تُتخطى مرحلة الصور
    // لما يكون مزوّد الصور غير متاح)، فنتحقق من التسمية المسماة لا من مرحلة بعينها.
    await expect(page.getByRole('status')).toHaveText(
      /نجيب صور المشاهد|نسجّل التعليق الصوتي|نصدّر الفيديو/,
    );

    await expect(page.getByRole('button', { name: 'تنزيل الفيديو' })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/ها هو الفيديو/)).toBeVisible();
    await expect(page.locator('.chat__player')).toBeVisible();

    // بعد التصدير: مشروع واحد فقط، وفيديو محفوظ واحد (ننتظر كتابة الحفظ).
    await expect.poll(async () => (await projects(page))[0]?.exports?.length ?? 0).toBe(1);
    const list = await projects(page);
    expect(list).toHaveLength(1);
    expect(list[0].exports?.length ?? 0).toBe(1);

    // لا تجاوز أفقي على عرض الهاتف.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('a failed export keeps one project and the retry reuses it', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.captureStream;
      let calls = 0;
      HTMLCanvasElement.prototype.captureStream = function captureStream(...args) {
        calls += 1;
        if (calls === 1) throw new Error('recorder blocked by test');
        return original.apply(this, args as []);
      };
    });

    await page.goto('/');
    await scriptCard(page, 'نصائح للقراية قبل النوم');

    await page.getByRole('button', { name: 'اصنع الفيديو' }).first().click();
    await expect(page.getByText(/توقف التصدير/)).toBeVisible({ timeout: 60_000 });

    const afterFailure = await projects(page);
    expect(afterFailure).toHaveLength(1);

    await page.getByRole('button', { name: 'اصنع الفيديو' }).last().click();
    await expect(page.getByRole('button', { name: 'تنزيل الفيديو' })).toBeVisible({ timeout: 90_000 });

    // السجل يُحفظ بعد التصيير، فننتظر كتابته بدل قراءة لحظية.
    await expect.poll(async () => (await projects(page))[0]?.exports?.length ?? 0).toBe(1);
    const afterRetry = await projects(page);
    expect(afterRetry).toHaveLength(1);
    expect(afterRetry[0].id).toBe(afterFailure[0].id);
    expect(afterRetry[0].exports?.length ?? 0).toBe(1);
  });
});

test('settings shows device storage and offers cleanup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /الإعدادات/ }).click();
  await expect(page.getByText('مساحة الجهاز')).toBeVisible();
  await expect(page.getByRole('button', { name: /نظّف الملفات/ })).toBeVisible();
  await expect(page.getByText('المستعمل:')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
