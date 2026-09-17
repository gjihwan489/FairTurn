import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const migrationDir = join(process.cwd(), "db", "migrations");
const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();

if (files.length === 0) {
  throw new Error("No SQL migrations found.");
}

const combinedSql = [];
for (const file of files) {
  combinedSql.push(await readFile(join(migrationDir, file), "utf8"));
}

const fullSchema = combinedSql.join("\n");
const required = ["CREATE TABLE profiles", "CREATE TABLE meetings", "CREATE TABLE private_locations", "CREATE TABLE burden_ledgers"];
for (const token of required) {
  if (!fullSchema.includes(token)) {
    throw new Error(`Migrations are missing required token: ${token}`);
  }
}

if (!process.env.DATABASE_URL) {
  console.log(`Validated ${files.length} migration file(s). DATABASE_URL is not set, so no live PostgreSQL migration was applied.`);
  process.exit(0);
}

console.log("DATABASE_URL is set. Apply db/migrations/*.sql with your PostgreSQL migration runner in deployment.");
console.log("This local script intentionally avoids printing DATABASE_URL or opening raw database connections.");
