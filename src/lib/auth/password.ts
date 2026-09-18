import bcrypt from "bcryptjs";

/** bcryptjs is pure JS on purpose: native `bcrypt` will not survive a
 * Linux-built payload landing on the host's Windows Node. */
const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * Initial and reset passwords. Ambiguous characters (O/0, I/l/1) are excluded
 * because these get read out over the phone.
 */
export function generatePassword(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}
