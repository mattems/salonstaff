import { createSpringboard } from "./springboard";

const port = Number(process.env.PORT ?? "4100");
const { server } = createSpringboard();
// This machine only: the page lists everything running here.
server.listen(port, "127.0.0.1", () => {
  console.log(`Springboard: http://localhost:${port}`);
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
