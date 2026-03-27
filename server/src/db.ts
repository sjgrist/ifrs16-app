// Uses the built-in node:sqlite module available in Node.js 22.5+
// No native compilation required.
import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../db/ifrs16.db");
const SCHEMA_PATH = path.join(__dirname, "../../db/schema.sql");

let _db: DatabaseSync | null = null;

export type DB = DatabaseSync;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  // Ensure parent directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new DatabaseSync(DB_PATH);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");

  // Apply schema
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  _db.exec(schema);

  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
