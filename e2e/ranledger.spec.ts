import {
  test as base,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { exampleBackup } from "../src/data/backup";

const origin = "http://127.0.0.1:4173";
const test = base.extend<{ ledgerPage: Page; ledgerContext: BrowserContext }>({
  ledgerContext: async ({ playwright }, use, info) => {
    const profileRoot = path.resolve(process.cwd(), ".cache", "browser");
    const profile = path.join(
      profileRoot,
      `test-${info.testId}-${crypto.randomUUID()}`,
    );
    const context = await playwright.chromium.launchPersistentContext(profile, {
      channel: "msedge",
      headless: true,
      viewport: { width: 1440, height: 1000 },
      locale: "id-ID",
      timezoneId: "Asia/Jakarta",
    });
    await use(context);
    await context.close();
    if (profile.startsWith(profileRoot + path.sep))
      await rm(profile, { recursive: true, force: true });
  },
  ledgerPage: async ({ ledgerContext }, use) => {
    const page = await ledgerContext.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await use(page);
    expect(errors).toEqual([]);
  },
});
async function add(
  page: Page,
  amount: string,
  note: string,
  income = false,
  date?: string,
) {
  await page
    .getByRole("button", { name: "Catat transaksi", exact: true })
    .last()
    .click();
  const dialog = page.getByRole("dialog");
  if (income)
    await dialog
      .getByRole("button", { name: "Pemasukan", exact: true })
      .click();
  await dialog.getByLabel("Nominal", { exact: true }).fill(amount);
  await dialog.getByLabel("Catatan opsional").fill(note);
  if (date) await dialog.getByLabel("Tanggal", { exact: true }).fill(date);
  await dialog
    .getByRole("button", {
      name: income ? "Simpan pemasukan" : "Simpan pengeluaran",
    })
    .click();
  await expect(dialog).not.toBeVisible();
}
async function upload(
  page: Page,
  content: string | Buffer,
  name = "backup.json",
) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: name.endsWith("json")
      ? "application/json"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(content),
  });
}
async function replaceFromBackup(page: Page) {
  await page.getByRole("radio", { name: /Ganti semua data/ }).check();
  await page.getByRole("button", { name: "Lanjutkan pemulihan" }).click();
  await page.getByLabel("Ketik GANTI untuk melanjutkan").fill("GANTI");
  await page.getByRole("button", { name: "Ganti & pulihkan" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

test("pencatatan tanpa akun, saldo awal, edit, hapus, filter, dan persistensi", async ({
  ledgerPage: page,
}) => {
  await expect(page.getByText("Mulai dari satu catatan")).toBeVisible();
  await page.goto(`${origin}/pengaturan`);
  await page.getByLabel("Saldo sebelum transaksi pertama (Rp)").fill("500000");
  await page.getByRole("button", { name: "Simpan saldo awal" }).click();
  await expect(page.getByRole("status")).toContainText("Saldo awal tersimpan");
  await page.goto(`${origin}/`);
  await add(page, "2500000", "Proyek website", true);
  await add(page, "35000", "Makan siang <img src=x onerror=alert(1)>");
  await add(page, "50000", "Bensin September", false, "2026-09-30");
  await expect(page.locator(".balance-amount")).toContainText("2.915.000");
  await page.reload();
  await expect(page.locator(".balance-amount")).toContainText("2.915.000");
  await page.goto(`${origin}/transaksi`);
  await expect(page.locator(".transaction-row")).toHaveCount(3);
  await expect(page.locator(".transaction-row img")).toHaveCount(0);
  await page
    .getByRole("button", { name: /Ubah pengeluaran Makan siang/ })
    .click();
  await page.getByLabel("Nominal", { exact: true }).fill("40000");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("textbox", { name: "Cari transaksi" }).fill("Bensin");
  await expect(page.locator(".transaction-row")).toHaveCount(1);
  await page.locator(".transaction-row").click();
  await page.getByRole("button", { name: "Hapus", exact: true }).click();
  await page.getByRole("button", { name: "Ya, hapus transaksi" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto(`${origin}/`);
  await expect(page.locator(".balance-amount")).toContainText("2.960.000");
});

test("nominal invalid tetap di formulir; modal bisa digunakan dengan keyboard", async ({
  ledgerPage: page,
}) => {
  await page
    .getByRole("button", { name: "Catat transaksi", exact: true })
    .last()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Nominal", { exact: true })).toBeFocused();
  await dialog.getByLabel("Nominal", { exact: true }).fill("0");
  await dialog.getByLabel("Catatan opsional").fill("Catatan dipertahankan");
  await dialog.getByRole("button", { name: "Simpan pengeluaran" }).click();
  await expect(dialog.getByRole("alert")).toContainText("lebih dari Rp0");
  await expect(dialog.getByLabel("Catatan opsional")).toHaveValue(
    "Catatan dipertahankan",
  );
  await dialog.getByLabel("Nominal", { exact: true }).fill("1.5");
  await dialog.getByRole("button", { name: "Simpan pengeluaran" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Jangan gunakan desimal",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("backup JSON/Excel, pemulihan utuh, merge idempoten, file rusak aman", async ({
  ledgerPage: page,
}) => {
  await page.goto(`${origin}/backup`);
  await upload(page, JSON.stringify(exampleBackup()));
  await expect(page.getByText("Format file valid")).toBeVisible();
  await replaceFromBackup(page);
  await expect(page.getByRole("status")).toContainText(
    "3 transaksi dipulihkan",
  );
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh JSON" }).click();
  const json = await (await jsonDownload).createReadStream();
  const jsonChunks: Buffer[] = [];
  for await (const chunk of json!) jsonChunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(jsonChunks);
  expect(JSON.parse(exported.toString()).transactions).toHaveLength(3);
  const excelDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh Excel" }).click();
  const excel = await (await excelDownload).createReadStream();
  const excelChunks: Buffer[] = [];
  for await (const chunk of excel!) excelChunks.push(Buffer.from(chunk));
  await upload(page, Buffer.concat(excelChunks), "backup.xlsx");
  await expect(page.getByText("Format file valid")).toBeVisible();
  await page.getByRole("button", { name: "Lanjutkan pemulihan" }).click();
  await page.getByRole("button", { name: "Gabungkan sekarang" }).click();
  await expect(page.getByRole("status")).toContainText(
    "0 transaksi ditambahkan, 3 ID",
  );
  await upload(page, "{broken", "bad.json");
  await expect(page.getByRole("alert")).toContainText("rusak");
  await page.goto(`${origin}/`);
  await expect(page.locator(".balance-amount")).toContainText("2.915.000");
  await page.goto(`${origin}/pengaturan`);
  await page.getByRole("button", { name: "Reset data lokal" }).click();
  await expect(
    page.getByRole("button", { name: "Hapus semua data" }),
  ).toBeDisabled();
  await page.getByLabel("Ketik HAPUS untuk mengonfirmasi").fill("HAPUS");
  await page.getByRole("button", { name: "Hapus semua data" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto(`${origin}/backup`);
  await upload(page, exported);
  await replaceFromBackup(page);
  await page.goto(`${origin}/`);
  await expect(page.locator(".balance-amount")).toContainText("2.915.000");
});

test("kategori dapat dibuat, diganti, diarsipkan, dan diaktifkan", async ({
  ledgerPage: page,
}) => {
  await page.goto(`${origin}/pengaturan`);
  await page.getByRole("button", { name: "Kategori", exact: true }).click();
  await page.getByLabel("Nama kategori").fill("Kopi sore");
  await page.getByRole("button", { name: "Simpan kategori" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Ubah kategori Kopi sore", exact: true })
    .click();
  await page.getByLabel("Nama kategori").fill("Kopi & teh");
  await page.getByRole("button", { name: "Simpan kategori" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Arsipkan kategori Kopi & teh" })
    .click();
  await expect(page.getByText("Kopi & teh", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Diarsipkan", exact: true }).click();
  await expect(page.getByText("Kopi & teh", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Aktifkan kategori Kopi & teh" })
    .click();
  await page.getByRole("button", { name: "Aktif", exact: true }).click();
  await expect(page.getByText("Kopi & teh", { exact: true })).toBeVisible();
});

test("desktop/mobile, gelap/terang, laporan drilldown, dan tangkapan layar", async ({
  ledgerPage: page,
}) => {
  await mkdir(path.join(process.cwd(), ".cache", "screenshots"), {
    recursive: true,
  });
  await page.screenshot({
    path: ".cache/screenshots/desktop-empty.png",
    fullPage: true,
  });
  await page.goto(`${origin}/backup`);
  await upload(page, JSON.stringify(exampleBackup()));
  await replaceFromBackup(page);
  await page.goto(`${origin}/`);
  await expect(page.locator(".transaction-row")).toHaveCount(3);
  await page.screenshot({
    path: ".cache/screenshots/desktop-home.png",
    fullPage: true,
  });
  await page.goto(`${origin}/laporan`);
  await expect(
    page.getByRole("img", { name: /Perbandingan pemasukan/ }),
  ).toBeVisible();
  await page.screenshot({
    path: ".cache/screenshots/desktop-reports.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Makan & Minum/ }).click();
  await expect(page).toHaveURL(/category=food/);
  await expect(page.locator(".transaction-row")).toHaveCount(1);
  await page.goto(`${origin}/pengaturan`);
  await page.getByRole("button", { name: "Gelap", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto(`${origin}/`);
  await page.screenshot({
    path: ".cache/screenshots/desktop-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/transaksi",
    "/laporan",
    "/backup",
    "/pengaturan",
  ]) {
    await page.goto(`${origin}${route}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.cache/screenshots/mobile-${route.slice(1) || "dashboard"}-dark.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Terang", exact: true }).click();
  await page.goto(`${origin}/`);
  await page.screenshot({
    path: ".cache/screenshots/mobile-home.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Catat transaksi", exact: true })
    .click();
  await page.screenshot({
    path: ".cache/screenshots/mobile-form.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`${origin}/transaksi`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("offline: reload, input, laporan, dan backup bekerja tanpa permintaan pihak ketiga", async ({
  ledgerPage: page,
  ledgerContext: context,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(origin))
      external.push(request.url());
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    undefined,
    { timeout: 12000 },
  );
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText("Kamu sedang offline.", { exact: false }),
  ).toBeVisible();
  await add(page, "25000", "Pengeluaran offline");
  await page.reload();
  await expect(page.locator(".balance-amount")).toContainText("25.000");
  await page.goto(`${origin}/backup`);
  await page.getByRole("button", { name: "Uji pemulihan contoh" }).click();
  await expect(page.getByRole("status")).toContainText(
    "3 transaksi contoh pulih identik",
  );
  expect(external).toEqual([]);
  await context.setOffline(false);
});

test("riwayat ribuan transaksi tetap terfilter dan hanya 30 baris ditampilkan", async ({
  ledgerPage: page,
}) => {
  const backup = exampleBackup();
  backup.transactions = Array.from({ length: 10_000 }, (_, i) => ({
    ...backup.transactions[0],
    id: `bulk-${i}`,
    amount: 10000,
    date: i % 2 === 0 ? "2025-12-31" : "2026-01-01",
    note: `Uji catatan ${i}`,
  }));
  await page.goto(`${origin}/backup`);
  await upload(page, JSON.stringify(backup));
  await replaceFromBackup(page);
  await page.goto(`${origin}/transaksi`);
  await expect(page.locator(".transaction-row")).toHaveCount(30);
  await expect(page.locator(".pagination")).toContainText("10.000 transaksi");
  await page.getByRole("button", { name: "Halaman berikutnya" }).click();
  await expect(page.locator(".pagination")).toContainText("31–60");
  await page
    .getByRole("textbox", { name: "Cari transaksi" })
    .fill("Uji catatan 9999");
  await expect(page.locator(".transaction-row")).toHaveCount(1);
  await page.goto(
    `${origin}/transaksi?period=custom&start=2025-12-31&end=2025-12-31`,
  );
  await expect(page.locator(".pagination")).toContainText("5.000 transaksi");
});

base("catatan bertahan setelah browser ditutup dan dibuka ulang", async () => {
  const root = path.resolve(process.cwd(), ".cache", "browser");
  const profile = path.join(root, `restart-${crypto.randomUUID()}`);
  let context = await chromium.launchPersistentContext(profile, {
    channel: "msedge",
    headless: true,
  });
  try {
    let page = await context.newPage();
    await page.goto(origin);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await add(page, "125000", "Tetap ada setelah browser ditutup", true);
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      channel: "msedge",
      headless: true,
    });
    page = await context.newPage();
    await page.goto(origin);
    await expect(page.locator(".balance-amount")).toContainText("125.000");
    await expect(page.locator(".transaction-row")).toHaveCount(1);
  } finally {
    await context.close();
    if (profile.startsWith(root + path.sep))
      await rm(profile, { recursive: true, force: true });
  }
});
