export interface Service {
  name: string;
  /** Where a click goes. */
  url: string;
  what: string;
  /**
   * How to tell whether it is running: an address to fetch, or a port to
   * connect to for things that don't speak HTTP. Left out for anything that
   * isn't on this machine.
   */
  check?: string | { port: number };
  /** Runs as a Docker container (docker-compose.yml) rather than a process `bun dev` starts. */
  docker?: boolean;
  /** The address to show, when the link itself isn't fit to read. */
  address?: string;
  /** In a `pane` group: opens in its own tab all the same, because it refuses to be framed. */
  ownTab?: boolean;
}

export interface Group {
  title: string;
  /** Its pages open inside the springboard, and each is listed under the group in the sidebar. */
  pane?: boolean;
  services: Service[];
}

/**
 * Everything `bun dev` starts. Ports are set where each service is configured
 * (apps/web/vite.config.ts, apps/admin/vite.config.ts, apps/api/wrangler.jsonc,
 * docker-compose.yml): a port changed there needs changing here.
 */
const postgresPort = Number(process.env.POSTGRES_PORT ?? "54349");

export const GROUPS: Group[] = [
  {
    title: "Apps",
    services: [
      {
        name: "Website",
        url: "http://localhost:5300",
        what: "salonstaff.com.au: jobs, the salon directory, job seeker and salon accounts.",
        check: "http://localhost:5300",
      },
      {
        name: "Admin portal",
        url: "http://localhost:5301",
        what: "admin.salonstaff.com.au: staff only. Locally a picker stands in for Cloudflare Access.",
        check: "http://localhost:5301",
      },
    ],
  },
  {
    title: "API",
    services: [
      {
        name: "API reference",
        url: "http://localhost:8890/docs",
        what: "Every public route, to read and try. The website and mobile app use these.",
        check: "http://localhost:8890/livez",
      },
      {
        name: "API readiness",
        url: "http://localhost:8890/readyz",
        what: "Whether the API can reach its database.",
        check: "http://localhost:8890/readyz",
      },
    ],
  },
  {
    title: "Tools",
    pane: true,
    services: [
      {
        name: "Mailpit",
        url: "http://localhost:8036",
        what: "Every email the app sends locally, and every SMS code (as sms+<number>@local.test).",
        check: "http://localhost:8036",
        docker: true,
      },
      {
        name: "Postgres",
        url: `postgresql://salonstaff:salonstaff@localhost:${postgresPort}/salonstaff?name=Salon%20Staff%20local&env=local`,
        address: `localhost:${postgresPort}`,
        what: "Postgres. Opens in TablePlus.",
        check: { port: postgresPort },
        docker: true,
      },
    ],
  },
];
