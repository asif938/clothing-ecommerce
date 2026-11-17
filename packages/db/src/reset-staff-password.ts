/**
 * `pnpm db:reset-staff-password` — operator recovery for a staff member who
 * can no longer log in (forgotten password, or locked out after too many
 * failed attempts). Run it from a machine whose environment points
 * DATABASE_URL at the target database.
 *
 * Prompts for the email and the new password (typed input is hidden), then
 * sets the new Argon2id hash, clears the lockout counters, revokes every
 * existing session for that account, and writes an audit-log entry. 2FA is
 * left as it is: this resets the password only.
 */
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@clothing/shared/crypto";

const MIN_PASSWORD_LENGTH = 10;

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const output = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    output._writeToOutput = (s: string) => {
      // Echo the prompt itself and line breaks, never the typed characters.
      if (s.startsWith(question) || s === "\r\n" || s === "\n") output.output.write(s);
    };
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const staff = await prisma.staffUser.findMany({
      where: { deletedAt: null },
      select: { email: true, name: true, status: true },
      orderBy: { createdAt: "asc" },
    });
    if (staff.length === 0) {
      console.log("No staff accounts exist. Open /setup on the admin app to create the first one.");
      return;
    }
    console.log("Staff accounts:");
    for (const s of staff) console.log(`  - ${s.email} (${s.name}, ${s.status})`);

    const email = await ask("\nEmail to reset: ");
    const user = await prisma.staffUser.findFirst({ where: { email, deletedAt: null } });
    if (!user) {
      console.error(`No staff account with email "${email}".`);
      process.exitCode = 1;
      return;
    }

    const password = await ask(`New password (min ${MIN_PASSWORD_LENGTH} chars, hidden): `, true);
    if (password.length < MIN_PASSWORD_LENGTH) {
      console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters. Nothing changed.`);
      process.exitCode = 1;
      return;
    }
    const confirm = await ask("Repeat new password: ", true);
    if (confirm !== password) {
      console.error("Passwords do not match. Nothing changed.");
      process.exitCode = 1;
      return;
    }

    const passwordHash = await hashPassword(password);
    const [, revoked] = await prisma.$transaction([
      prisma.staffUser.update({
        where: { id: user.id },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      prisma.staffSession.deleteMany({ where: { staffUserId: user.id } }),
      prisma.auditLog.create({
        data: {
          actorType: "system",
          action: "staff_user.password_reset_cli",
          entityType: "staff_user",
          entityId: user.id,
        },
      }),
    ]);
    console.log(`Password reset for ${user.email}. Lockout cleared, ${revoked.count} session(s) signed out.`);
    if (user.totpEnabled) console.log("2FA is still enabled on this account; you will need your authenticator code.");
  } finally {
    await prisma.$disconnect();
  }
}

void main();
