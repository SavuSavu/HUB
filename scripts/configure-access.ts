import { randomBytes, pbkdf2Sync } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { ACCESS_ITERATIONS } from "../src/access";
// No password is accepted on the command line or written to committed files.
const fromStdin = process.argv.includes("--stdin");
let input = "";
if (fromStdin) {
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
}
const password = fromStdin
  ? input.replace(/\r?\n$/, "")
  : randomBytes(18).toString("base64url");
if (!password || password.length > 1024)
  throw new Error("Password must contain 1–1024 characters.");
const salt = randomBytes(24).toString("hex");
const hash = pbkdf2Sync(
  password,
  salt,
  ACCESS_ITERATIONS,
  32,
  "sha256",
).toString("hex");
let env = "";
try {
  env = await readFile(".env.local", "utf8");
} catch {}
env = env
  .split("\n")
  .filter((line) => !/^VITE_ACCESS_(HASH|SALT)=/.test(line))
  .join("\n")
  .trim();
await writeFile(
  ".env.local",
  `${env ? env + "\n" : ""}VITE_ACCESS_HASH=${hash}\nVITE_ACCESS_SALT=${salt}\n`,
  { mode: 0o600 },
);
if (!fromStdin)
  await writeFile(
    ".hub-access.txt",
    `HUB access password: ${password}\n\nBuild configuration is in .env.local. Both files must stay out of Git.\n`,
    { mode: 0o600 },
  );
console.log(
  fromStdin
    ? "Access password configured in .env.local."
    : "Access configured. Your generated password is in .hub-access.txt (local only).",
);
