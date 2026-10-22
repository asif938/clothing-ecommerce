import { hash, verify } from "@node-rs/argon2";

/** Argon2id password hashing for `staff_users.password_hash` (§5.1). */
export async function hashPassword(plaintext: string): Promise<string> {
  return await hash(plaintext);
}

export async function verifyPassword(hashValue: string, plaintext: string): Promise<boolean> {
  return await verify(hashValue, plaintext);
}
