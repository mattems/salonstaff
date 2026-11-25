/**
 * The Commands and Accounts pages. Scripts are the ones in the root
 * package.json; a renamed one needs renaming here too.
 */

export interface Command {
  /** What to type, as it is pasted. */
  command: string;
  what: string;
}

export interface CommandGroup {
  title: string;
  commands: Command[];
}

export const COMMANDS: CommandGroup[] = [
  {
    title: "Data",
    commands: [
      { command: "bun db:seed", what: "Demo salons, jobs, directory listings, a demo seeker and your staff owner (safe to re-run)" },
      {
        command: "bun db:staff -- --email you@example.com --role owner",
        what: "Make someone staff, for the admin portal",
      },
      { command: "bun db:migrate", what: "Apply migrations to the local database" },
      { command: "bun db:reset", what: "Empty the local database and migrate again" },
      { command: "bun db:studio", what: "Browse the local database" },
      {
        command: "bun db:generate -- --name <name>",
        what: "A migration, after changing packages/db/src/schema.ts",
      },
    ],
  },
  {
    title: "Checks",
    commands: [
      { command: "bun run ci", what: "Every CI check, locally. Run before opening a PR" },
      { command: "bun run lint", what: "Biome: lint and format check" },
      { command: "bun run format", what: "Apply formatting" },
      { command: "bun run typecheck", what: "" },
      { command: "bun run test", what: "Needs the Docker services" },
      {
        command: "bun run api:types",
        what: "Regenerate the website's and admin portal's typed API clients after changing the API",
      },
    ],
  },
  {
    title: "From a terminal",
    commands: [
      {
        command:
          "curl -c cookies.txt -X POST http://localhost:8890/v1/auth/dev-login -H 'Content-Type: application/json' -d '{\"role\":\"seeker\"}'",
        what: "Sign in as the demo seeker; then curl -b cookies.txt http://localhost:8890/v1/me",
      },
    ],
  },
];

export interface Account {
  name: string;
  /** Who you are once signed in, or what to type. */
  detail: string;
  how: string;
  url?: string;
  /** A fixture only. */
  password?: string;
}

export interface AccountGroup {
  title: string;
  note?: string;
  accounts: Account[];
}

export const ACCOUNTS: AccountGroup[] = [
  {
    title: "Website",
    note: "Sign in with an email or mobile code: both arrive in Mailpit locally. Or use Dev login (local only) on the sign-in screen. bun db:seed makes these accounts.",
    accounts: [
      {
        name: "Demo job seeker",
        detail: "seeker@salonstaff.test",
        how: "Dev login, or an email code.",
        url: "http://localhost:5300/sign-in",
      },
      {
        name: "Demo salon owners",
        detail: "owner1@salonstaff.test … owner6@salonstaff.test",
        how: "Dev login as a salon, or an email code.",
        url: "http://localhost:5300/sign-in?as=employer",
      },
      {
        name: "Anyone new",
        detail: "Any email or Australian mobile",
        how: "A code signs you up on first use.",
        url: "http://localhost:5300/sign-in",
      },
    ],
  },
  {
    title: "Admin portal",
    note: "There is no Cloudflare Access locally: the portal asks which staff member you are and remembers it in the browser. Passkey confirmations can be skipped locally.",
    accounts: [
      {
        name: "Staff",
        detail: "STAFF_EMAIL in .env (added by bun db:seed), or anyone added with bun db:staff",
        how: "Pick yourself on the portal's first screen.",
        url: "http://localhost:5301",
      },
    ],
  },
];
