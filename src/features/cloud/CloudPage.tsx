import { useEffect, useState, type FormEvent } from "react";
import { useCloud, api, type CloudUser } from "../../data/cloud";
import { useLedger } from "../../components/LedgerProvider";
import { PageHeading, ErrorNotice } from "../../components/ui";
import { SelectField } from "../../components/SelectField";
import { downloadFile } from "../../data/backup";
import { Modal } from "../../components/Modal";
import { errorMessage } from "../../domain/ledger";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
}
interface Device {
  id: string;
  label: string;
  created_at: string;
  current: boolean;
}
interface Event {
  id: string;
  actor: string;
  action: string;
  created_at: string;
}
export default function CloudPage() {
  const cloud = useCloud(),
    ledger = useLedger();
  const [mode, setMode] = useState("login"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [recovery, setRecovery] = useState(""),
    [newRecovery, setNewRecovery] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [spaceName, setSpaceName] = useState(""),
    [upload, setUpload] = useState(false),
    [inviteRole, setInviteRole] = useState("editor"),
    [invite, setInvite] = useState(""),
    [joinCode, setJoinCode] = useState("");
  const [members, setMembers] = useState<Member[]>([]),
    [devices, setDevices] = useState<Device[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [choices, setChoices] = useState<Record<string, "local" | "remote">>({}),
    [deleting, setDeleting] = useState(false),
    [confirm, setConfirm] = useState("");
  const [reloading, setReloading] = useState(false),
    [reloadText, setReloadText] = useState("");
  async function work(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function details() {
    if (!cloud.user) return;
    setDevices((await api<{ devices: Device[] }>("/auth/devices")).devices);
    if (cloud.active) {
      const id = cloud.active.id;
      const [m, a] = await Promise.all([
        api<{ members: Member[] }>(`/spaces/${id}/members`),
        api<{ events: Event[] }>(`/spaces/${id}/audit`),
      ]);
      setMembers(m.members);
      setEvents(a.events);
    }
  }
  useEffect(() => {
    if (cloud.user) void details().catch((e) => setError(errorMessage(e)));
  }, [cloud.user?.id, cloud.active?.id]);
  async function authenticate(e: FormEvent) {
    e.preventDefault();
    await work(async () => {
      const body = {
        email,
        password,
        device: navigator.userAgent.includes("Mobile")
          ? "Browser mobile"
          : "Browser desktop",
        ...(mode === "register" ? { name } : {}),
        ...(mode === "recover" ? { recoveryCode: recovery } : {}),
      };
      const result = await api<{ user?: CloudUser; recoveryCode?: string }>(
        `/auth/${mode}`,
        "POST",
        body,
      );
      setPassword("");
      setRecovery("");
      if (result.recoveryCode) setNewRecovery(result.recoveryCode);
      await cloud.refresh();
    });
  }
  return (
    <>
      <PageHeading
        eyebrow="DATA DALAM KENDALIMU"
        title="Ruang & sinkronisasi"
        description="Gunakan ledger lokal atau aktifkan ruang tersinkron untuk perangkat dan orang yang kamu pilih."
      />
      {(error || cloud.error) && (
        <ErrorNotice>{error || cloud.error}</ErrorNotice>
      )}
      <section className="v3-statement">
        <span className="eyebrow">RUANG AKTIF</span>
        <h2>{cloud.active?.name ?? "Ledger lokal"}</h2>
        <p>
          {cloud.active
            ? `${cloud.status} · ${cloud.active.role === "viewer" ? "Hak baca" : cloud.active.role === "owner" ? "Pemilik" : "Editor"}`
            : "Catatan berada di browser ini. Masuk akun tidak otomatis mengunggah ledger."}
        </p>
        {cloud.active && (
          <div className="v3-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void work(cloud.sync)}
            >
              Sinkronkan sekarang
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={cloud.local}
            >
              Buka ledger lokal
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setReloading(true)}
            >
              Muat versi ruang
            </button>
          </div>
        )}
      </section>
      {!cloud.user ? (
        <section className="v3-section narrow-section">
          <div className="tabs" role="group" aria-label="Akses akun">
            {[
              ["login", "Masuk"],
              ["register", "Buat akun"],
              ["recover", "Pulihkan akses"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={mode === value ? "active" : ""}
                onClick={() => {
                  setMode(value);
                  setError("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={authenticate} className="v3-form">
            {mode === "register" && (
              <div className="field">
                <label htmlFor="cloud-name">Namamu</label>
                <input
                  id="cloud-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="cloud-email">Email akun</label>
              <input
                id="cloud-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                required
                autoComplete="email"
              />
            </div>
            {mode === "recover" && (
              <div className="field">
                <label htmlFor="recovery-code">Recovery code</label>
                <input
                  id="recovery-code"
                  value={recovery}
                  onChange={(e) => setRecovery(e.target.value)}
                  required
                  autoComplete="off"
                />
                <p className="field-hint">
                  Kode yang disimpan saat akun dibuat. Seluruh sesi lama dicabut
                  setelah pemulihan.
                </p>
              </div>
            )}
            <div className="field">
              <label htmlFor="cloud-password">
                {mode === "recover" ? "Kata sandi baru" : "Kata sandi"}
              </label>
              <input
                id="cloud-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                maxLength={128}
                required
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
              <p className="field-hint">
                Minimal 12 karakter. Akses dipulihkan dengan recovery code,
                tanpa email otomatis.
              </p>
            </div>
            <button className="button primary" disabled={busy}>
              {busy
                ? "Memproses…"
                : mode === "login"
                  ? "Masuk akun"
                  : mode === "register"
                    ? "Buat akun"
                    : "Pulihkan akun"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="v3-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">AKUN</span>
                <h2>{cloud.user.name}</h2>
                <p>{cloud.user.email}</p>
                <p className="field-hint">
                  Alamat akun belum diverifikasi melalui email. Simpan recovery
                  code untuk pemulihan akses.
                </p>
              </div>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void work(cloud.logout)}
              >
                Keluar akun
              </button>
            </div>
            <div className="v3-register">
              {cloud.spaces.map((space) => (
                <div className="v3-row" key={space.id}>
                  <div>
                    <strong>{space.name}</strong>
                    <small>
                      {space.role === "owner"
                        ? "Pemilik"
                        : space.role === "editor"
                          ? "Editor"
                          : "Pembaca"}
                    </small>
                  </div>
                  <button
                    className="button secondary small-button"
                    disabled={busy || space.id === cloud.active?.id}
                    onClick={() => void work(() => cloud.connect(space))}
                  >
                    {space.id === cloud.active?.id
                      ? "Sedang dibuka"
                      : "Buka ruang"}
                  </button>
                </div>
              ))}
            </div>
            <form
              className="v3-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void work(async () => {
                  const space = await api<{
                    id: string;
                    name: string;
                    role: "owner";
                    revision: number;
                  }>("/spaces", "POST", { name: spaceName });
                  await cloud.refresh();
                  await cloud.connect(space, upload);
                  setSpaceName("");
                  setUpload(false);
                });
              }}
            >
              <div className="field">
                <label htmlFor="space-name">Ruang baru</label>
                <input
                  id="space-name"
                  value={spaceName}
                  onChange={(e) => setSpaceName(e.target.value)}
                  placeholder="Pribadi atau Rumah tangga"
                  maxLength={60}
                  required
                />
              </div>
              <button className="button primary" disabled={busy}>
                Buat ruang
              </button>
              {!cloud.active && (
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={upload}
                    onChange={(e) => setUpload(e.target.checked)}
                  />
                  Salin {ledger.transactions.length} transaksi dan{" "}
                  {ledger.wallets.length} akun lokal ke ruang ini. Backup JSON
                  diunduh dahulu.
                </label>
              )}
            </form>
            <form
              className="v3-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void work(async () => {
                  await api("/spaces/join", "POST", { code: joinCode.trim() });
                  setJoinCode("");
                  await cloud.refresh();
                });
              }}
            >
              <div className="field">
                <label htmlFor="join-code">Kode undangan ruang</label>
                <input
                  id="join-code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <button className="button secondary" disabled={busy}>
                Gabung ruang
              </button>
            </form>
          </section>
          {cloud.active && (
            <section className="v3-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">RUANG BERSAMA</span>
                  <h2>Anggota & aktivitas</h2>
                </div>
                <button
                  className="button secondary small-button"
                  disabled={busy}
                  onClick={() => void work(details)}
                >
                  Muat aktivitas
                </button>
              </div>
              <div className="v3-register">
                {members.map((member) => (
                  <div className="v3-row" key={member.id}>
                    <div>
                      <strong>{member.name}</strong>
                      <small>
                        {member.email} · {member.role}
                      </small>
                    </div>
                    {cloud.active?.role === "owner" &&
                      member.role !== "owner" && (
                        <div className="v3-actions">
                          <SelectField
                            aria-label={`Peran ${member.name}`}
                            value={member.role}
                            options={[
                              { value: "editor", label: "Editor" },
                              { value: "viewer", label: "Pembaca" },
                            ]}
                            onValueChange={(role) =>
                              void work(async () => {
                                await api(
                                  `/spaces/${cloud.active!.id}/members/${member.id}`,
                                  "PATCH",
                                  { role },
                                );
                                await details();
                              })
                            }
                          />
                          <button
                            className="button text-danger"
                            disabled={busy}
                            onClick={() =>
                              void work(async () => {
                                await api(
                                  `/spaces/${cloud.active!.id}/members/${member.id}`,
                                  "DELETE",
                                );
                                await details();
                              })
                            }
                          >
                            Cabut akses
                          </button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
              {cloud.active.role === "owner" && (
                <div className="v3-inline-form">
                  <SelectField
                    aria-label="Peran undangan"
                    value={inviteRole}
                    onValueChange={setInviteRole}
                    options={[
                      { value: "editor", label: "Editor" },
                      { value: "viewer", label: "Pembaca" },
                    ]}
                  />
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void work(async () => {
                        setInvite(
                          (
                            await api<{ code: string }>(
                              `/spaces/${cloud.active!.id}/invites`,
                              "POST",
                              { role: inviteRole },
                            )
                          ).code,
                        );
                        await details();
                      })
                    }
                  >
                    Buat undangan
                  </button>
                  {invite && (
                    <div className="field full-width">
                      <label htmlFor="invite-code">
                        Kode satu kali · berlaku 24 jam
                      </label>
                      <input
                        id="invite-code"
                        readOnly
                        value={invite}
                        onFocus={(e) => e.target.select()}
                      />
                      <p className="field-hint">
                        Bagikan hanya kepada orang yang kamu izinkan mengakses
                        seluruh ledger ruang ini.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {events.length > 0 && (
                <details>
                  <summary>Riwayat perubahan terakhir</summary>
                  <div className="v3-register">
                    {events.map((event) => (
                      <div className="v3-row" key={event.id}>
                        <div>
                          <strong>{event.action}</strong>
                          <small>
                            {event.actor} ·{" "}
                            {new Date(event.created_at).toLocaleString("id-ID")}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}
          {cloud.conflicts && (
            <section className="v3-section conflict-section">
              <span className="eyebrow">PERLU DITINJAU</span>
              <h2>Selesaikan perubahan yang bertabrakan</h2>
              <p>
                Pilih versi untuk setiap catatan. Perubahan yang tidak
                bertabrakan akan digabung.
              </p>
              {cloud.conflicts.conflicts.map((conflict) => {
                const key = `${conflict.entity}/${conflict.id}`;
                return (
                  <div key={key} className="conflict-row">
                    <h3>
                      {String(
                        conflict.after?.note ??
                          conflict.after?.name ??
                          conflict.remote?.name ??
                          "Catatan yang diubah",
                      )}
                    </h3>
                    <div className="conflict-options">
                      {(["local", "remote"] as const).map((side) => (
                        <label key={side}>
                          <input
                            type="radio"
                            name={key}
                            checked={choices[key] === side}
                            onChange={() =>
                              setChoices({ ...choices, [key]: side })
                            }
                          />
                          <strong>
                            {side === "local"
                              ? "Versi perangkat ini"
                              : "Versi ruang"}
                          </strong>
                          <pre>
                            {JSON.stringify(
                              side === "local"
                                ? conflict.after
                                : conflict.remote,
                              null,
                              2,
                            )}
                          </pre>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void work(() => cloud.resolve(choices))}
              >
                Terapkan pilihan
              </button>
            </section>
          )}
          <section className="v3-section">
            <h2>Perangkat & kendali data</h2>
            <div className="v3-register">
              {devices.map((device) => (
                <div className="v3-row" key={device.id}>
                  <div>
                    <strong>
                      {device.label}
                      {device.current ? " · perangkat ini" : ""}
                    </strong>
                    <small>
                      Masuk{" "}
                      {new Date(device.created_at).toLocaleString("id-ID")}
                    </small>
                  </div>
                  {!device.current && (
                    <button
                      className="button text-danger"
                      disabled={busy}
                      onClick={() =>
                        void work(async () => {
                          await api(`/auth/devices/${device.id}`, "DELETE");
                          await details();
                        })
                      }
                    >
                      Cabut sesi
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="v3-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    const data = await api("/auth/export");
                    downloadFile(
                      JSON.stringify(data, null, 2),
                      "ranledger-account-export.json",
                      "application/json",
                    );
                  })
                }
              >
                Ekspor seluruh ruang akun
              </button>
              <button
                className="button text-danger"
                onClick={() => setDeleting(true)}
              >
                Hapus akun cloud
              </button>
            </div>
            <p className="field-hint">
              Ekspor akun memuat semua ruang yang bisa kamu akses. Pemulihan
              ledger memakai backup lengkap pada halaman Backup.
            </p>
          </section>
        </>
      )}
      {reloading && (
        <Modal
          open
          onClose={() => setReloading(false)}
          busy={busy}
          title="Muat ulang data dari ruang"
          description="Perubahan lokal yang belum terkirim akan diganti versi ruang. Backup perangkat ini diunduh sebelum penggantian."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void work(async () => {
                if (reloadText !== "MUAT")
                  throw new Error("Ketik MUAT untuk melanjutkan.");
                await cloud.reloadRemote();
                setReloading(false);
                setReloadText("");
              });
            }}
          >
            <div className="field">
              <label htmlFor="reload-confirm">Ketik MUAT</label>
              <input
                id="reload-confirm"
                value={reloadText}
                onChange={(e) => setReloadText(e.target.value)}
              />
            </div>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <div className="modal-footer">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setReloading(false)}
              >
                Batal
              </button>
              <button
                className="button primary"
                disabled={busy || reloadText !== "MUAT"}
              >
                Unduh backup & muat versi ruang
              </button>
            </div>
          </form>
        </Modal>
      )}
      {newRecovery && (
        <Modal
          open
          onClose={() => setNewRecovery("")}
          title="Simpan recovery code"
          description="Kode ini hanya ditampilkan sekarang. Simpan terpisah dari kata sandi untuk memulihkan akun."
        >
          <div className="field">
            <label htmlFor="new-recovery">Recovery code baru</label>
            <input
              id="new-recovery"
              readOnly
              value={newRecovery}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() =>
                downloadFile(
                  newRecovery,
                  "ranledger-recovery-code.txt",
                  "text/plain",
                )
              }
            >
              Unduh kode
            </button>
            <button
              className="button primary"
              onClick={() => setNewRecovery("")}
            >
              Sudah kusimpan
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(false)}
          busy={busy}
          title="Hapus akun cloud"
          description="Seluruh ruang yang kamu miliki beserta data dan undangannya akan dihapus dari server. Ekspor data sebelum melanjutkan."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void work(async () => {
                if (confirm !== "HAPUS AKUN")
                  throw new Error("Ketik HAPUS AKUN untuk melanjutkan.");
                await api("/auth/account", "DELETE", { password });
                cloud.local();
                await cloud.refresh().catch(() => {});
                location.reload();
              });
            }}
          >
            <div className="field">
              <label htmlFor="delete-password">Kata sandi akun</label>
              <input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="field">
              <label htmlFor="delete-confirm">Ketik HAPUS AKUN</label>
              <input
                id="delete-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <div className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setDeleting(false)}
              >
                Batal
              </button>
              <button
                className="button danger"
                disabled={busy || confirm !== "HAPUS AKUN"}
              >
                Hapus akun
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
