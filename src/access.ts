export const ACCESS_ITERATIONS = 210_000;
export function validAccessConfig(hash: string, salt: string) {
  return /^[a-f0-9]{64}$/i.test(hash) && /^[a-f0-9]{32,128}$/i.test(salt);
}
export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  if (!validAccessConfig(hash, salt) || !password || password.length > 1024)
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const result = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: ACCESS_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  const expected = Uint8Array.from(hash.match(/../g)!, (hex) =>
    parseInt(hex, 16),
  );
  let difference = 0;
  new Uint8Array(result).forEach((byte, i) => {
    difference |= byte ^ expected[i];
  });
  return difference === 0;
}
