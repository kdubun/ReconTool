import { app } from 'electron';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

let database: BetterSqlite3.Database | null = null;

type TableInfoRow = {
  name: string;
};

const hasColumn = (
  db: BetterSqlite3.Database,
  table: string,
  column: string,
): boolean => {
  const columns = db.prepare<[], TableInfoRow>(`PRAGMA table_info(${table})`).all();
  return columns.some((entry) => entry.name === column);
};

const addColumnIfMissing = (
  db: BetterSqlite3.Database,
  table: string,
  columnName: string,
  definition: string,
): void => {
  if (!hasColumn(db, table, columnName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnName} ${definition};`);
  }
};

const runMigrations = (db: BetterSqlite3.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recon_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target TEXT NOT NULL,
      type TEXT NOT NULL,
      dns TEXT,
      whois TEXT,
      headers TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT,
      display_name TEXT,
      first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      tags_json TEXT NOT NULL DEFAULT '[]',
      risk_score REAL NOT NULL DEFAULT 0,
      UNIQUE(value, type)
    );

    CREATE TABLE IF NOT EXISTS relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      weight INTEGER NOT NULL DEFAULT 1,
      confidence REAL NOT NULL DEFAULT 0.6,
      first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      source TEXT NOT NULL DEFAULT 'passive',
      scan_id INTEGER,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY(source_id) REFERENCES targets(id),
      FOREIGN KEY(target_id) REFERENCES targets(id)
    );

    CREATE TABLE IF NOT EXISTS enrichment_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      live_enrichment_enabled INTEGER NOT NULL DEFAULT 0,
      geo_enrichment_enabled INTEGER NOT NULL DEFAULT 0,
      tech_enrichment_enabled INTEGER NOT NULL DEFAULT 0,
      shodan_enabled INTEGER NOT NULL DEFAULT 0,
      censys_enabled INTEGER NOT NULL DEFAULT 0,
      virustotal_enabled INTEGER NOT NULL DEFAULT 0,
      abuseipdb_enabled INTEGER NOT NULL DEFAULT 0,
      geo_advanced_enabled INTEGER NOT NULL DEFAULT 0,
      asn_registry_enabled INTEGER NOT NULL DEFAULT 0,
      nmap_enabled INTEGER NOT NULL DEFAULT 0,
      shodan_api_key TEXT NOT NULL DEFAULT '',
      censys_api_id TEXT NOT NULL DEFAULT '',
      censys_api_secret TEXT NOT NULL DEFAULT '',
      virustotal_api_key TEXT NOT NULL DEFAULT '',
      abuseipdb_api_key TEXT NOT NULL DEFAULT '',
      geoip_api_key TEXT NOT NULL DEFAULT '',
      asn_registry_api_key TEXT NOT NULL DEFAULT '',
      ai_assistant_enabled INTEGER NOT NULL DEFAULT 0,
      ai_api_key TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scan_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      artifact_type TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.6,
      source TEXT NOT NULL DEFAULT 'passive',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(scan_id) REFERENCES recon_results(id)
    );

    CREATE TABLE IF NOT EXISTS node_attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_id INTEGER NOT NULL,
      attribute_key TEXT NOT NULL,
      attribute_value TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.6,
      source TEXT NOT NULL DEFAULT 'passive',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(target_id) REFERENCES targets(id),
      UNIQUE(target_id, attribute_key, attribute_value)
    );
  `);

  addColumnIfMissing(db, 'targets', 'category', 'TEXT');
  addColumnIfMissing(db, 'targets', 'display_name', 'TEXT');
  addColumnIfMissing(db, 'targets', 'first_seen', 'TEXT');
  addColumnIfMissing(db, 'targets', 'last_seen', 'TEXT');
  addColumnIfMissing(db, 'targets', 'tags_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'targets', 'risk_score', 'REAL NOT NULL DEFAULT 0');

  addColumnIfMissing(db, 'relations', 'weight', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'relations', 'confidence', 'REAL NOT NULL DEFAULT 0.6');
  addColumnIfMissing(db, 'relations', 'first_seen', 'TEXT');
  addColumnIfMissing(db, 'relations', 'last_seen', 'TEXT');
  addColumnIfMissing(db, 'relations', 'source', "TEXT NOT NULL DEFAULT 'passive'");
  addColumnIfMissing(db, 'relations', 'scan_id', 'INTEGER');
  addColumnIfMissing(db, 'relations', 'evidence_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'enrichment_settings', 'shodan_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'enrichment_settings', 'censys_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'enrichment_settings', 'virustotal_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'enrichment_settings', 'abuseipdb_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'enrichment_settings', 'geo_advanced_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'enrichment_settings', 'asn_registry_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'enrichment_settings', 'nmap_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'enrichment_settings', 'shodan_api_key', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'enrichment_settings', 'censys_api_id', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'enrichment_settings', 'censys_api_secret', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'enrichment_settings', 'virustotal_api_key', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'enrichment_settings', 'abuseipdb_api_key', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'enrichment_settings', 'geoip_api_key', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'enrichment_settings', 'asn_registry_api_key', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'enrichment_settings', 'ai_assistant_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'enrichment_settings', 'ai_api_key', "TEXT NOT NULL DEFAULT ''");

  db.exec(`
    INSERT INTO enrichment_settings (id)
    VALUES (1)
    ON CONFLICT(id) DO NOTHING;

    UPDATE targets
    SET first_seen = COALESCE(first_seen, CURRENT_TIMESTAMP),
        last_seen = COALESCE(last_seen, CURRENT_TIMESTAMP);

    UPDATE relations
    SET first_seen = COALESCE(first_seen, CURRENT_TIMESTAMP),
        last_seen = COALESCE(last_seen, CURRENT_TIMESTAMP);

    CREATE INDEX IF NOT EXISTS idx_recon_results_created_at ON recon_results(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recon_results_type ON recon_results(type);
    CREATE INDEX IF NOT EXISTS idx_targets_value_type ON targets(value, type);
    CREATE INDEX IF NOT EXISTS idx_targets_type_last_seen ON targets(type, last_seen DESC);
    CREATE INDEX IF NOT EXISTS idx_relations_source_target ON relations(source_id, target_id);
    CREATE INDEX IF NOT EXISTS idx_relations_confidence ON relations(confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_relations_weight ON relations(weight DESC);
    CREATE INDEX IF NOT EXISTS idx_relations_last_seen ON relations(last_seen DESC);
    CREATE INDEX IF NOT EXISTS idx_artifacts_scan_type ON scan_artifacts(scan_id, artifact_type);
    CREATE INDEX IF NOT EXISTS idx_node_attributes_target ON node_attributes(target_id);

    DELETE FROM relations
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM relations
      GROUP BY source_id, target_id, type
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_relations_unique
      ON relations(source_id, target_id, type);
  `);
};

const cleanupLegacyDatabaseFiles = (): void => {
  const basePath = path.join(app.getPath('userData'), 'recontool.sqlite');
  [basePath, `${basePath}-shm`, `${basePath}-wal`].forEach((candidate) => {
    try {
      if (existsSync(candidate)) {
        unlinkSync(candidate);
      }
    } catch {
      // Best-effort cleanup only.
    }
  });
};

export const initDatabase = (): BetterSqlite3.Database => {
  if (database) {
    return database;
  }

  cleanupLegacyDatabaseFiles();
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = MEMORY');
  runMigrations(db);
  database = db;
  return db;
};

export const getDatabase = (): BetterSqlite3.Database => {
  if (!database) {
    throw new Error('Database not initialized');
  }

  return database;
};

export const wipeDatabase = (): void => {
  if (!database) {
    return;
  }
  database.exec(`
    DELETE FROM relations;
    DELETE FROM node_attributes;
    DELETE FROM scan_artifacts;
    DELETE FROM recon_results;
    DELETE FROM targets;
  `);
};

export const closeDatabase = (): void => {
  if (!database) {
    return;
  }
  database.close();
  database = null;
};
