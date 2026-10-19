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
const browserChannel = process.env.CI ? undefined : "msedge";
const test = base.extend<{ ledgerPage: Page; ledgerContext: BrowserContext }>({
  ledgerContext: async ({ playwright }, use, info) => {
    const profileRoot = path.resolve(process.cwd(), ".cache", "browser");
    const profile = path.join(
      profileRoot,
      `test-${info.testId}-${crypto.randomUUID()}`,
    );
    const context = await playwright.chromium.launchPersistentContext(profile, {
      ...(browserChannel ? { channel: browserChannel } : {}),
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
  await page.getByLabel("Pilih file backup", { exact: true }).setInputFiles({
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
  await expect(
    page.getByRole("heading", { name: "Mulai dari satu catatan", exact: true }),
  ).toBeVisible();
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
  const skipLink = page.locator(".skip-link");
  await expect(skipLink).toHaveCSS("opacity", "0");
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveCSS("opacity", "1");
  await page.keyboard.press("Tab");
  await expect(skipLink).toHaveCSS("opacity", "0");
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
  await expect(page.locator(".toast[role='status']")).toContainText(
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
  await expect(page.locator(".toast[role='status']")).toContainText(
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
    ...(browserChannel ? { channel: browserChannel } : {}),
    headless: true,
  });
  try {
    let page = await context.newPage();
    await page.goto(origin);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await add(page, "125000", "Tetap ada setelah browser ditutup", true);
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      ...(browserChannel ? { channel: browserChannel } : {}),
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

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
test("v2: dompet, transfer, anggaran, target, jadwal, laporan, dan backup terhubung", async ({
  ledgerPage: page,
}) => {
  await mkdir(path.join(process.cwd(), ".cache", "screenshots"), {
    recursive: true,
  });
  const today = await page.evaluate(() => {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  });
  await page.goto(`${origin}/dompet`);
  await page
    .getByRole("button", { name: "Ubah dompet Utama", exact: true })
    .click();
  await page.getByLabel("Saldo awal dompet (Rp)").fill("1000000");
  await expect(page.getByLabel("Saldo awal dompet (Rp)")).toHaveValue(
    "1.000.000",
  );
  await page.getByLabel("Saldo awal dompet (Rp)").press("Home");
  await page.getByLabel("Saldo awal dompet (Rp)").press("ArrowRight");
  await page.getByLabel("Saldo awal dompet (Rp)").press("Delete");
  await expect(page.getByLabel("Saldo awal dompet (Rp)")).toHaveValue(
    "100.000",
  );
  await page.getByLabel("Saldo awal dompet (Rp)").fill("1000000");
  await page
    .getByRole("button", { name: "Simpan dompet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Tambah dompet", exact: true })
    .click();
  await page.getByLabel("Nama dompet").fill("Dana darurat");
  await choose(page, "Jenis dompet", "Tabungan");
  await page
    .getByRole("button", { name: "Simpan dompet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Transfer", exact: true }).click();
  await choose(page, "Dompet asal", "Utama");
  await choose(page, "Dompet tujuan", "Dana darurat");
  await page.getByLabel("Nominal (Rp)", { exact: true }).fill("200000");
  await page
    .getByRole("button", { name: "Simpan transfer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".ledger-statement strong")).toContainText(
    "1.000.000",
  );
  await expect(
    page.getByRole("button", { name: "Ubah dompet Utama", exact: true }),
  ).toContainText("800.000");
  await expect(
    page.getByRole("button", { name: "Ubah dompet Dana darurat", exact: true }),
  ).toContainText("200.000");
  await page.screenshot({
    path: ".cache/screenshots/v2-wallets-desktop.png",
    fullPage: true,
  });
  await page.goto(`${origin}/rencana/tujuan`);
  await page.getByRole("button", { name: "Buat target", exact: true }).click();
  await page.getByLabel("Nama target").fill("Cadangan enam bulan");
  await choose(page, "Dompet tabungan", "Dana darurat");
  await page.getByLabel("Jumlah yang ingin dicapai (Rp)").fill("2000000");
  await page.getByLabel("Tanggal target").fill("2027-12-31");
  await page
    .getByRole("button", { name: "Simpan target", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".goal-line")).toContainText("200.000");
  await page.goto(`${origin}/anggaran`);
  await page
    .getByRole("button", { name: "Atur anggaran", exact: true })
    .click();
  await choose(page, "Kategori anggaran", "Makan & Minum");
  await page.getByLabel("Batas pengeluaran (Rp)").fill("100000");
  await page
    .getByRole("button", { name: "Simpan anggaran", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto(`${origin}/`);
  await add(page, "85000", "Belanja makan");
  await page.goto(`${origin}/anggaran`);
  await expect(page.locator(".budget-line")).toContainText("Mendekati batas");
  await expect(page.locator(".budget-line")).toContainText("15.000");
  await page.screenshot({
    path: ".cache/screenshots/v2-budgets-desktop.png",
    fullPage: true,
  });
  await page.goto(`${origin}/rencana`);
  await page
    .getByRole("button", { name: "Tambah jadwal", exact: true })
    .click();
  await page.getByLabel("Nama jadwal").fill("Internet rumah");
  await choose(page, "Kategori jadwal", "Tagihan");
  await page.getByLabel("Nominal (Rp)", { exact: true }).fill("150000");
  await page.getByLabel("Jadwal berikutnya").fill(today);
  await page
    .getByRole("button", { name: "Simpan jadwal", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Catat", exact: true }).click();
  await page
    .getByRole("button", { name: "Konfirmasi & catat", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".schedule-line")).toContainText("Mendatang");
  await page.goto(`${origin}/laporan`);
  await expect(page.locator(".report-summary")).toContainText("235.000");
  await expect(page.locator(".report-budgets")).toContainText("85.000");
  await choose(page, "Dompet laporan", "Dana darurat");
  await expect(page.locator(".report-summary")).toContainText("Rp 0");
  await page.goto(`${origin}/`);
  await expect(page.locator(".balance-amount")).toContainText("765.000");
  await page.screenshot({
    path: ".cache/screenshots/v2-home-desktop.png",
    fullPage: true,
  });
  await page.goto(`${origin}/backup`);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh JSON", exact: true }).click();
  const stream = await (await downloaded).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.formatVersion).toBe(3);
  expect(backup.wallets).toHaveLength(2);
  expect(backup.transfers).toHaveLength(1);
  expect(backup.budgets).toHaveLength(1);
  expect(backup.schedules).toHaveLength(1);
  expect(backup.goals).toHaveLength(1);
  await page.goto(`${origin}/pengaturan`);
  await page.getByRole("button", { name: "Gelap", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/dompet",
    "/anggaran",
    "/rencana",
    "/rencana/tujuan",
    "/impor",
    "/laporan",
    "/transaksi",
  ]) {
    await page.goto(`${origin}${route}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.cache/screenshots/v2-mobile-${route.slice(1).replaceAll("/", "-") || "home"}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Lainnya", exact: true }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Menu lainnya" })
      .getByRole("link", { name: "Dompet", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Menu lainnya" })
    .getByRole("link", { name: "Dompet", exact: true })
    .click();
  await expect(page).toHaveURL(/dompet/);
});
test("v2: CSV offline dengan pratinjau, duplikat, baris invalid, dan konfirmasi atomik", async ({
  ledgerPage: page,
  ledgerContext: context,
}) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.goto(`${origin}/impor`);
  const csv =
    "tanggal;jenis;nominal;kategori;catatan\n2026-01-05;pengeluaran;25000;Makan & Minum;Kopi\n2026-01-05;pengeluaran;25000;Makan & Minum;Kopi\n2026-02-31;pemasukan;1000000;Gaji/Freelance;Rusak";
  await page.locator('input[type="file"]').setInputFiles({
    name: "transaksi.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await choose(page, "Cara menentukan jenis", "Dari kolom jenis");
  await page
    .getByRole("button", { name: "Buat pratinjau", exact: true })
    .click();
  await expect(page.locator(".csv-preview")).toContainText(
    "1 dipilih · 1 kemungkinan duplikat · 1 baris tidak valid",
  );
  await expect(
    page.getByLabel("Impor baris 3", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Impor baris 4", { exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: ".cache/screenshots/v2-csv-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Impor 1 transaksi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Konfirmasi impor", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto(`${origin}/transaksi`);
  await expect(page.locator(".transaction-row")).toHaveCount(1);
  await expect(page.locator(".transaction-row")).toContainText("25.000");
  await context.setOffline(false);
});

test("v3: kredit, pembayaran, refund, kalender, simulasi, dan backup terenkripsi", async ({
  ledgerPage: page,
}) => {
  test.setTimeout(90000);
  await page.goto(`${origin}/dompet`);
  await page
    .getByRole("button", { name: "Ubah dompet Utama", exact: true })
    .click();
  await page.getByLabel("Saldo awal dompet (Rp)").fill("1000000");
  await page
    .getByRole("button", { name: "Simpan dompet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto(`${origin}/kewajiban`);
  await page
    .getByRole("button", { name: "Tambah akun kewajiban", exact: true })
    .click();
  await page.getByLabel("Nama dompet").fill("Kartu perjalanan");
  await page.getByLabel("Utang awal (Rp)").fill("500000");
  await page
    .getByRole("button", { name: "Simpan dompet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Catat transaksi", exact: true })
    .click();
  await page.getByLabel("Nominal", { exact: true }).fill("200000");
  await choose(page, "Dompet", "Kartu perjalanan");
  await page.getByLabel("Catatan opsional").fill("Pembelian kartu");
  await page
    .getByRole("button", { name: "Simpan pengeluaran", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Bayar", exact: true }).click();
  await page.getByLabel("Nominal (Rp)", { exact: true }).fill("300000");
  await page
    .getByRole("button", { name: "Catat pembayaran", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".v3-major-number")).toContainText("400.000");
  await page
    .getByRole("button", { name: "Catat transaksi", exact: true })
    .click();
  await page.getByLabel("Nominal", { exact: true }).fill("50000");
  await choose(page, "Dompet", "Kartu perjalanan");
  await page.getByLabel("Catatan opsional").fill("Refund kartu");
  await page.getByLabel("Pengembalian dana (refund)", { exact: false }).check();
  await page
    .getByRole("button", { name: "Simpan pengeluaran", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".v3-major-number")).toContainText("350.000");
  await page.getByRole("button", { name: "Atur tagihan", exact: true }).click();
  await page.getByLabel("Rencana pembayaran bulanan (Rp)").fill("100000");
  await page
    .getByRole("button", { name: "Simpan aturan pembayaran", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto(`${origin}/laporan`);
  await expect(page.locator(".report-summary")).toContainText("150.000");
  await expect(page.locator(".financial-report")).toContainText("300.000");
  await expect(page.locator(".financial-report")).toContainText("350.000");
  await page.goto(`${origin}/kalender`);
  await page.getByLabel("Nominal skenario (Rp)").fill("150000");
  await page
    .getByRole("button", { name: "Terapkan simulasi", exact: true })
    .click();
  await expect(page.locator(".forecast-legend")).toContainText(
    "Memuat simulasi",
  );
  await page.screenshot({
    path: ".cache/screenshots/v3-calendar-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Bulanan", exact: true }).click();
  await expect(page.locator(".month-calendar th")).toHaveCount(7);
  await page.screenshot({
    path: ".cache/screenshots/v3-month-desktop.png",
    fullPage: true,
  });
  await page.goto(`${origin}/transaksi`);
  await expect(page.locator(".transaction-row")).toHaveCount(2);
  await page.goto(`${origin}/backup`);
  await page
    .getByRole("button", { name: "Unduh backup terenkripsi", exact: true })
    .click();
  await page
    .getByLabel("Frasa sandi backup", { exact: true })
    .fill("synthetic backup passphrase");
  await page
    .getByLabel("Ulangi frasa sandi")
    .fill("synthetic backup passphrase");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Enkripsi & unduh", exact: true })
    .click();
  const file = await download;
  const stream = await file.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Pilih backup terenkripsi").setInputFiles({
    name: "backup.rledger",
    mimeType: "application/json",
    buffer: Buffer.concat(chunks),
  });
  await page
    .getByLabel("Frasa sandi backup", { exact: true })
    .fill("synthetic backup passphrase");
  await page
    .getByRole("button", { name: "Buka & periksa", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".import-preview")).toBeVisible();
  await page.goto(origin + "/pengaturan");
  await page.getByRole("button", { name: "Gelap", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/kalender", "/kewajiban", "/rekonsiliasi", "/ruang"]) {
    await page.goto(origin + route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (route === "/kalender") {
      await page.getByRole("button", { name: "Bulanan", exact: true }).click();
      const next = page.getByRole("button", {
        name: "Bulan berikutnya",
        exact: true,
      });
      if (await next.isEnabled()) await next.click();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.cache/screenshots/v3-mobile-${route.slice(1)}.png`,
      fullPage: true,
    });
  }
});

async function cloudSignup(page: Page, email: string) {
  await page.goto(origin + "/ruang");
  await page
    .getByRole("button", { name: "Buat akun", exact: true })
    .first()
    .click();
  await page.getByLabel("Namamu", { exact: true }).fill("Synthetic owner");
  await page.getByLabel("Email akun", { exact: true }).fill(email);
  await page
    .getByLabel("Kata sandi", { exact: true })
    .fill("synthetic-browser-password");
  await page
    .getByRole("button", { name: "Buat akun", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Sudah kusimpan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Synthetic owner", exact: true }),
  ).toBeVisible();
}
async function cloudLogin(page: Page, email: string) {
  await page.goto(origin + "/ruang");
  await page.getByLabel("Email akun", { exact: true }).fill(email);
  await page
    .getByLabel("Kata sandi", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Masuk akun", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic owner", exact: true }),
  ).toBeVisible();
}
async function manualSync(page: Page) {
  await page.goto(origin + "/ruang");
  await page
    .getByRole("button", { name: "Sinkronkan sekarang", exact: true })
    .click();
  await expect(page.locator(".workspace-selector small")).toContainText(
    "Tersinkron",
    { timeout: 20000 },
  );
}
test("v3: dua perangkat, offline queue, konflik, dan ledger lokal terpisah", async ({
  ledgerPage: page,
}) => {
  test.setTimeout(150000);
  const email = `browser-${crypto.randomUUID()}@example.test`;
  await add(page, "25000", "Catatan awal lokal");
  await cloudSignup(page, email);
  await page
    .getByLabel("Ruang baru", { exact: true })
    .fill("Ruang pribadi sinkron");
  await page.getByLabel(/Salin 1 transaksi/).check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat ruang", exact: true }).click();
  await download;
  await expect(page.locator(".workspace-selector small")).toContainText(
    "Tersinkron",
    { timeout: 20000 },
  );
  const browser = await chromium.launch({
    ...(browserChannel ? { channel: browserChannel } : {}),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Jakarta",
  });
  const second = await context.newPage();
  try {
    await cloudLogin(second, email);
    await second
      .getByRole("button", { name: "Buka ruang", exact: true })
      .click();
    await expect(second.locator(".workspace-selector small")).toContainText(
      "Tersinkron",
      { timeout: 20000 },
    );
    await second.goto(origin + "/transaksi");
    await expect(second.locator(".transaction-row")).toHaveCount(1);
    await second.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await second.reload();
    await second.waitForFunction(() =>
      Boolean(navigator.serviceWorker.controller),
    );
    await context.setOffline(true);
    await add(second, "15000", "Dari perangkat offline");
    await add(page, "20000", "Dari perangkat online");
    await manualSync(page);
    await context.setOffline(false);
    await manualSync(second);
    await second.goto(origin + "/transaksi");
    await expect(second.locator(".transaction-row")).toHaveCount(3);
    await manualSync(page);
    await page.goto(origin + "/transaksi");
    await expect(page.locator(".transaction-row")).toHaveCount(3);
    await context.setOffline(true);
    await second
      .locator(".transaction-row")
      .filter({ hasText: "Catatan awal lokal" })
      .click();
    await second.getByLabel("Catatan opsional").fill("Versi offline");
    await second
      .getByRole("button", { name: "Simpan perubahan", exact: true })
      .click();
    await expect(second.getByRole("dialog")).not.toBeVisible();
    await page
      .locator(".transaction-row")
      .filter({ hasText: "Catatan awal lokal" })
      .click();
    await page.getByLabel("Catatan opsional").fill("Versi online");
    await page
      .getByRole("button", { name: "Simpan perubahan", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await manualSync(page);
    await context.setOffline(false);
    await second.goto(origin + "/ruang");
    await second
      .getByRole("button", { name: "Sinkronkan sekarang", exact: true })
      .click();
    await expect(
      second.getByRole("heading", {
        name: "Selesaikan perubahan yang bertabrakan",
      }),
    ).toBeVisible({ timeout: 20000 });
    await second
      .locator(".conflict-options label")
      .filter({ hasText: "Versi ruang" })
      .locator("input")
      .check();
    await second
      .getByRole("button", { name: "Terapkan pilihan", exact: true })
      .click();
    await expect(
      second.getByRole("heading", {
        name: "Selesaikan perubahan yang bertabrakan",
      }),
    ).not.toBeVisible();
    await manualSync(second);
    await second.goto(origin + "/transaksi");
    await expect(
      second.locator(".transaction-row").filter({ hasText: "Versi online" }),
    ).toHaveCount(1);
    await page.goto(origin + "/ruang");
    await page.screenshot({
      path: ".cache/screenshots/v3-cloud-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Buka ledger lokal", exact: true })
      .click();
    await page.goto(origin + "/transaksi");
    await expect(page.locator(".transaction-row")).toHaveCount(1);
    await expect(page.locator(".transaction-row")).toContainText(
      "Catatan awal lokal",
    );
  } finally {
    await browser.close();
  }
});

test("v3: undangan ruang bersama dan hak pembaca", async ({
  ledgerPage: page,
}) => {
  test.setTimeout(90000);
  await cloudSignup(page, `owner-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Ruang baru", { exact: true }).fill("Rumah tangga");
  await page.getByRole("button", { name: "Buat ruang", exact: true }).click();
  await expect(page.locator(".workspace-selector small")).toContainText(
    "Tersinkron",
    { timeout: 20000 },
  );
  await choose(page, "Peran undangan", "Pembaca");
  await page
    .getByRole("button", { name: "Buat undangan", exact: true })
    .click();
  const code = await page
    .getByLabel("Kode satu kali · berlaku 24 jam")
    .inputValue();
  const browser = await chromium.launch({
    ...(browserChannel ? { channel: browserChannel } : {}),
    headless: true,
  });
  const context = await browser.newContext(),
    reader = await context.newPage();
  try {
    await cloudSignup(reader, `reader-${crypto.randomUUID()}@example.test`);
    await reader.getByLabel("Kode undangan ruang").fill(code);
    await reader
      .getByRole("button", { name: "Gabung ruang", exact: true })
      .click();
    await reader
      .getByRole("button", { name: "Buka ruang", exact: true })
      .click();
    await expect(reader.locator(".workspace-selector small")).toContainText(
      "Tersinkron",
      { timeout: 20000 },
    );
    await expect(reader.locator(".sidebar-add")).toBeDisabled();
    await expect(reader.locator(".v3-access-banner")).toContainText("dibaca");
    await page
      .getByRole("button", { name: "Muat aktivitas", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cabut akses", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Cabut akses", exact: true })
      .click();
    await reader
      .getByRole("button", { name: "Sinkronkan sekarang", exact: true })
      .click();
    await expect(reader.locator(".workspace-selector strong")).toHaveText(
      "Keuangan pribadi",
      { timeout: 15000 },
    );
  } finally {
    await browser.close();
  }
});

test("v3: aturan kategori, pencocokan laporan, dan undo batch", async ({
  ledgerPage: page,
}) => {
  await add(page, "25000", "Kopi tercatat", false, "2026-01-05");
  await page.goto(origin + "/rekonsiliasi");
  await page
    .getByRole("button", { name: "Tambah aturan", exact: true })
    .click();
  await page.getByLabel("Keterangan mengandung").fill("coffee");
  await choose(page, "Kategori hasil aturan", "Makan & Minum");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto(origin + "/impor");
  await page.locator('input[type="file"]').setInputFiles({
    name: "statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "tanggal;jenis;nominal;kategori;catatan\n2026-01-05;pengeluaran;25000;Makan & Minum;Kopi tercatat\n2026-01-06;pengeluaran;20000;Tidak dikenal;coffee baru",
    ),
  });
  await choose(page, "Cara menentukan jenis", "Dari kolom jenis");
  await page
    .getByRole("button", { name: "Buat pratinjau", exact: true })
    .click();
  await page.getByLabel("Cocokkan baris 2 dengan transaksi yang ada").check();
  await page
    .getByRole("button", { name: "Impor 1 transaksi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Konfirmasi impor", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto(origin + "/rekonsiliasi");
  await expect(
    page.locator(".v3-row").filter({ hasText: "statement.csv" }),
  ).toContainText("1 transaksi baru · 1 dicocokkan");
  await page
    .getByRole("button", { name: "Batalkan batch", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Batalkan batch", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto(origin + "/transaksi");
  await expect(page.locator(".transaction-row")).toHaveCount(1);
  await expect(page.locator(".transaction-row")).toContainText("Kopi tercatat");
});
