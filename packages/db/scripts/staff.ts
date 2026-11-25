/**
 * Adds, changes, removes or lists admin portal staff, against the database in
 * DATABASE_URL. Staff need no customer account: Cloudflare Access is their
 * sign-in, so the address here must also be on the Access list. Day to day
 * this is done on the portal's Staff screen; the script is for the first
 * owner of a fresh environment. See docs/runbooks/add-a-staff-member.md.
 *
 *   bun db:staff -- --email you@example.com --name "Your Name" --role owner
 *   bun db:staff -- --email someone@example.com --remove
 *   bun db:staff -- --email you@example.com --reset-passkeys
 *   bun db:staff -- --list
 */
import { parseArgs } from "node:util";
import { isStaffRole, STAFF_ROLES } from "@salonstaff/shared";
import { connect, LastOwnerError, staffOffice } from "../src/index";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
    remove: { type: "boolean", default: false },
    "reset-passkeys": { type: "boolean", default: false },
    list: { type: "boolean", default: false },
  },
});

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Locally, run `bun run setup` to create .env.");
  process.exit(1);
}

// Provider connection strings carry libpq-only ssl settings the driver can't use
// (see scripts/migrate.ts).
const target = new URL(url);
for (const name of [...target.searchParams.keys()]) {
  if (name.startsWith("ssl")) target.searchParams.delete(name);
}
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
const { db, close } = await connect(target.toString(), isLocal ? {} : { ssl: "verify-full" });
const actor = { type: "system" as const };

try {
  const office = staffOffice(db);
  const data = office.staff;
  if (values.list) {
    const everyone = await data.list();
    if (everyone.length === 0) console.log("Nobody is staff yet.");
    for (const person of everyone) {
      console.log(`${person.role.padEnd(10)} ${person.email}  (${person.name})`);
    }
  } else if (!values.email) {
    throw new Error("Pass --email, or --list");
  } else if (values["reset-passkeys"]) {
    // For an owner nobody else can reset: whoever can run this already holds the database.
    const member = await data.findActive(values.email);
    if (!member) throw new Error(`${values.email} is not staff`);
    const removed = await office.passkeys.reset(member, "Reset with the staff script", actor);
    console.log(`Removed ${removed} passkey(s). ${values.email} can register a new one.`);
  } else if (values.remove) {
    const member = await data.findActive(values.email);
    if (member) await data.remove(member, "Removed with the staff script", actor);
    console.log(member ? `${values.email} is no longer staff` : `${values.email} was not staff`);
  } else {
    if (!values.role || !isStaffRole(values.role)) {
      throw new Error(`--role must be one of: ${STAFF_ROLES.join(", ")}`);
    }
    const member = await data.findActive(values.email);
    if (member) {
      await data.changeRole(member, values.role, "Changed with the staff script", actor);
    } else {
      // A name is for people reading the audit log; the address works as one until it is set.
      const name = values.name?.trim() || (values.email.split("@")[0] as string);
      await data.add({ name, email: values.email, role: values.role }, actor);
    }
    console.log(`${values.email} is now staff with the ${values.role} role`);
    console.log("They also need to be on the Cloudflare Access list to open a deployed portal.");
  }
} catch (error) {
  if (!(error instanceof LastOwnerError)) throw error;
  console.error("That is the only owner. Make someone else an owner first.");
  process.exitCode = 1;
} finally {
  await close();
}
