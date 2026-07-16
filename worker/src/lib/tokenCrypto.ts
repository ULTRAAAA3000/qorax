// ============================================================
// tokenCrypto.ts — спільний AES-GCM helper для шифрування OAuth
// refresh-токенів. Формат серіалізації (hex `iv:ciphertext`) —
// той самий, що вже використовується в ga4Handler.ts (Analytics-
// модуль), НЕ base64-формат `.`, який мала попередня версія цього
// файлу (втрачена десь між сесіями — знайдено при перевірці перед
// написанням Mail OAuth: gscHandler.ts і ga4Handler.ts кожен мають
// власну копію encrypt/decrypt, замість переюзання одного файлу,
// той самий клас проблеми, що мотивував консолідацію json() у
// httpUtils.ts раніше).
//
// gscHandler.ts і ga4Handler.ts НЕ мігровано на цей файл цим
// комітом (не ризикувати наявними зашифрованими токенами на проді
// без окремого плану міграції даних) — нові OAuth-інтеграції
// (Mail) використовують ЦЕЙ файл із самого початку.
// ============================================================

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(hexKey);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(token: string, hexKey: string): Promise<string> {
  const key = await getKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(token);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(encrypted: string, hexKey: string): Promise<string> {
  const [ivHex, ciphertextHex] = encrypted.split(":");
  const key = await getKey(hexKey);
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
