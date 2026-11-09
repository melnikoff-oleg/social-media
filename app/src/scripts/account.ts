import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { adminAudit, sessions, users } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/auth/normalize";
import { hashPassword } from "@/lib/auth/password";
import { copyStarterContent, findStarterOwnerId } from "@/lib/accounts/starter";

export type User = typeof users.$inferSelect;

const passwordSchema = z.string().min(8, "password must be at least 8 characters");
const createSchema = z.object({
  email: z.string().trim().min(3).max(254),
  name: z.string().trim().min(1).max(200),
  password: passwordSchema,
  role: z.enum(["admin", "user"]),
});

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: "admin" | "user";
}): Promise<User> {
  const parsed = createSchema.parse(input);
  const email = normalizeEmail(parsed.email);
  const passwordHash = await hashPassword(parsed.password);
  try {
    const [user] = await db
      .insert(users)
      .values({ email, name: parsed.name, passwordHash, role: parsed.role })
      .returning();
    return user;
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error("email already exists");
    throw e;
  }
}

export async function resetPassword(email: string, password: string): Promise<void> {
  const pw = passwordSchema.parse(password);
  const passwordHash = await hashPassword(pw);
  // The new password logs the user out everywhere, atomically with the change.
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(users)
      .set({ passwordHash })
      .where(eq(users.email, normalizeEmail(email)))
      .returning({ id: users.id });
    if (rows.length === 0) throw new Error("user not found");
    await tx.delete(sessions).where(eq(sessions.userId, rows[0].id));
  });
}

export async function setActive(email: string, active: boolean): Promise<void> {
  // Deactivating deletes the sessions in the same transaction, so re-enabling later
  // never brings old sessions back.
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(users)
      .set({ active })
      .where(eq(users.email, normalizeEmail(email)))
      .returning({ id: users.id });
    if (rows.length === 0) throw new Error("user not found");
    if (!active) await tx.delete(sessions).where(eq(sessions.userId, rows[0].id));
  });
}

export async function deleteUser(email: string): Promise<void> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  if (!user) throw new Error("user not found");
  // admin_audit.admin_id has no ON DELETE: refuse instead of hitting the FK.
  const [audit] = await db
    .select({ id: adminAudit.id })
    .from(adminAudit)
    .where(eq(adminAudit.adminId, user.id))
    .limit(1);
  if (audit) throw new Error("admin has audit records; disable the account instead");
  await db.delete(users).where(eq(users.id, user.id));
}

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("no terminal available: pass --password"));
      return;
    }
    process.stderr.write(question);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stderr.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function getPassword(provided: string | undefined): Promise<string> {
  if (provided) return provided;
  const first = await promptHidden("Password: ");
  const second = await promptHidden("Repeat password: ");
  if (first !== second) throw new Error("passwords do not match");
  return first;
}

function usage(): never {
  console.error(
    [
      "Usage:",
      '  create-user --email <email> --name "<name>" --role admin|user [--password <pw>]',
      "  reset-password --email <email> [--password <pw>]",
      "  disable-user --email <email>",
      "  enable-user --email <email>",
      "  delete-user --email <email>",
    ].join("\n")
  );
  process.exit(2);
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
      password: { type: "string" },
    },
  });
  if (!cmd || !values.email) usage();
  const email = values.email;

  switch (cmd) {
    case "create-user": {
      if (!values.name) usage();
      const password = await getPassword(values.password);
      const user = await createUser({
        email,
        name: values.name,
        password,
        role: (values.role ?? "user") as "admin" | "user",
      });
      console.log(`user created: ${user.id} (${user.email}, ${user.role})`);
      // Starter content only on account creation, from the first admin (if any).
      const copied = await copyStarterContent(await findStarterOwnerId(), user.id);
      if (copied.configs || copied.creators) {
        console.log(`starter content copied: ${copied.configs} configs, ${copied.creators} creators`);
      }
      break;
    }
    case "reset-password": {
      await resetPassword(email, await getPassword(values.password));
      console.log("password updated");
      break;
    }
    case "disable-user":
      await setActive(email, false);
      console.log("user disabled");
      break;
    case "enable-user":
      await setActive(email, true);
      console.log("user enabled");
      break;
    case "delete-user":
      await deleteUser(email);
      console.log("user deleted");
      break;
    default:
      usage();
  }
}

// CLI entry (npm run create-user -- ...). Skipped when imported by tests.
if (process.argv[1] && /account\.[cm]?[jt]s$/.test(process.argv[1])) {
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((e) => {
      const known = ["email already exists", "user not found", "passwords do not match", "no terminal available", "admin has audit records"];
      if (e instanceof z.ZodError) console.error(e.issues.map((i) => i.message).join("; "));
      else if (e instanceof Error && known.some((k) => e.message.startsWith(k))) console.error(e.message);
      else console.error("database error");
      process.exit(1);
    });
}
