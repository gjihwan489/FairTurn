import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dataDir = join(process.cwd(), "data");
await mkdir(dataDir, { recursive: true });
await writeFile(
  join(dataDir, "seed-summary.json"),
  JSON.stringify(
    {
      seededAt: new Date().toISOString(),
      mode: process.env.DATABASE_URL ? "database-configured" : "fixture-summary-only",
      hubs: ["홍대입구", "신도림", "강남역", "부천역 상권", "신중동역 상권", "판교"],
      note: "Runtime fixture data lives in src/domain/hubs.ts and is explicitly labelled as demo data."
    },
    null,
    2
  )
);

console.log("Seed summary written to data/seed-summary.json. No secret or private location data was written.");
