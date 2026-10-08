import { pbkdf2Sync } from "node:crypto";
import { expect, it } from "vitest";
import {
  verifyPassword,
  validAccessConfig,
  ACCESS_ITERATIONS,
} from "../src/access";
const salt = "0123456789abcdef0123456789abcdef";
const hash = pbkdf2Sync(
  "test-password",
  salt,
  ACCESS_ITERATIONS,
  32,
  "sha256",
).toString("hex");
it("accepts only the configured password using the matching derivation", async () => {
  expect(await verifyPassword("test-password", hash, salt)).toBe(true);
  expect(await verifyPassword("incorrect", hash, salt)).toBe(false);
});
it("fails closed with absent or malformed configuration", async () => {
  expect(validAccessConfig("", salt)).toBe(false);
  expect(await verifyPassword("anything", "", salt)).toBe(false);
  expect(await verifyPassword("", hash, salt)).toBe(false);
  expect(await verifyPassword("x".repeat(1025), hash, salt)).toBe(false);
});
