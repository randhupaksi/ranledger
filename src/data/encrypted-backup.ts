import { z } from "zod";
import { parseBackup, type Backup } from "./backup";
const envelope = z
  .object({
    app: z.literal("ranledger-encrypted"),
    version: z.literal(1),
    algorithm: z.literal("AES-GCM"),
    iterations: z.literal(600000),
    salt: z.string().max(64),
    iv: z.string().max(32),
    ciphertext: z.string().max(360_000_000),
  })
  .strict();
function base64(data: Uint8Array) {
  let result = "";
  for (let i = 0; i < data.length; i += 8192)
    result += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(result);
}
function bytes(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
async function key(passphrase: string, salt: Uint8Array) {
  if (passphrase.length < 12)
    throw new Error("Frasa sandi minimal 12 karakter.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 600000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptBackup(backup: Backup, passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(32)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const secret = await key(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("ranledger-backup-v1"),
    },
    secret,
    new TextEncoder().encode(JSON.stringify(backup)),
  );
  const value = {
    app: "ranledger-encrypted",
    version: 1,
    algorithm: "AES-GCM",
    iterations: 600000,
    salt: base64(salt),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  };
  const text = JSON.stringify(value);
  const restored = await decryptBackup(text, passphrase);
  if (JSON.stringify(restored) !== JSON.stringify(backup))
    throw new Error("Verifikasi backup terenkripsi gagal.");
  return text;
}
export async function decryptBackup(
  text: string,
  passphrase: string,
): Promise<Backup> {
  const data = envelope.parse(JSON.parse(text));
  try {
    const salt = bytes(data.salt),
      iv = bytes(data.iv);
    if (salt.length !== 32 || iv.length !== 12) throw new Error();
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode("ranledger-backup-v1"),
      },
      await key(passphrase, salt),
      bytes(data.ciphertext),
    );
    return parseBackup(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {
    throw new Error("Frasa sandi salah atau file terenkripsi rusak.");
  }
}
