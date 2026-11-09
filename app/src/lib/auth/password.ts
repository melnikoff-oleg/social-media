import { hash, verify } from "@node-rs/argon2";

// Algorithm.Argon2id = 2 (const enum in the package, so use the literal).
const ARGON2ID = 2;

export async function hashPassword(pw: string): Promise<string> {
  return hash(pw, { algorithm: ARGON2ID });
}

export async function verifyPassword(hashed: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashed, pw);
  } catch {
    return false;
  }
}
