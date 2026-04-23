import { readFile, writeFile } from 'node:fs/promises';
import { getDatabase } from '@main/database/init';
import type { DataTransferSummary } from '@shared/types';

type SnapshotPayload = {
  version: 1;
  exportedAt: string;
  tables: {
    recon_results: Array<Record<string, unknown>>;
    targets: Array<Record<string, unknown>>;
    relations: Array<Record<string, unknown>>;
    scan_artifacts: Array<Record<string, unknown>>;
    node_attributes: Array<Record<string, unknown>>;
    enrichment_settings: Array<Record<string, unknown>>;
  };
};

const summarize = (payload: SnapshotPayload): DataTransferSummary => ({
  reconResults: payload.tables.recon_results.length,
  targets: payload.tables.targets.length,
  relations: payload.tables.relations.length,
  artifacts: payload.tables.scan_artifacts.length,
  attributes: payload.tables.node_attributes.length,
});

export const exportWorkspaceSnapshot = async (
  filePath: string,
): Promise<DataTransferSummary> => {
  const db = getDatabase();
  const payload: SnapshotPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      recon_results: db.prepare('SELECT * FROM recon_results').all() as Array<Record<string, unknown>>,
      targets: db.prepare('SELECT * FROM targets').all() as Array<Record<string, unknown>>,
      relations: db.prepare('SELECT * FROM relations').all() as Array<Record<string, unknown>>,
      scan_artifacts: db
        .prepare('SELECT * FROM scan_artifacts')
        .all() as Array<Record<string, unknown>>,
      node_attributes: db
        .prepare('SELECT * FROM node_attributes')
        .all() as Array<Record<string, unknown>>,
      enrichment_settings: db
        .prepare('SELECT * FROM enrichment_settings')
        .all() as Array<Record<string, unknown>>,
    },
  };

  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return summarize(payload);
};

export const importWorkspaceSnapshot = async (
  filePath: string,
): Promise<DataTransferSummary> => {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as SnapshotPayload;

  if (parsed.version !== 1 || !parsed.tables) {
    throw new Error('Invalid snapshot format');
  }

  const db = getDatabase();
  const runImport = db.transaction((payload: SnapshotPayload) => {
    db.exec(`
      DELETE FROM relations;
      DELETE FROM node_attributes;
      DELETE FROM scan_artifacts;
      DELETE FROM recon_results;
      DELETE FROM targets;
    `);

    const insertRecon = db.prepare(
      `INSERT INTO recon_results (id, target, type, dns, whois, headers, created_at)
       VALUES (@id, @target, @type, @dns, @whois, @headers, @created_at)`,
    );
    const insertTarget = db.prepare(
      `INSERT INTO targets (id, value, type, category, display_name, first_seen, last_seen, tags_json, risk_score)
       VALUES (@id, @value, @type, @category, @display_name, @first_seen, @last_seen, @tags_json, @risk_score)`,
    );
    const insertRelation = db.prepare(
      `INSERT INTO relations (id, source_id, target_id, type, weight, confidence, first_seen, last_seen, source, scan_id, evidence_json)
       VALUES (@id, @source_id, @target_id, @type, @weight, @confidence, @first_seen, @last_seen, @source, @scan_id, @evidence_json)`,
    );
    const insertArtifact = db.prepare(
      `INSERT INTO scan_artifacts (id, scan_id, artifact_type, value, confidence, source, metadata_json, created_at)
       VALUES (@id, @scan_id, @artifact_type, @value, @confidence, @source, @metadata_json, @created_at)`,
    );
    const insertAttribute = db.prepare(
      `INSERT INTO node_attributes (id, target_id, attribute_key, attribute_value, confidence, source, updated_at)
       VALUES (@id, @target_id, @attribute_key, @attribute_value, @confidence, @source, @updated_at)`,
    );

    payload.tables.recon_results.forEach((row) => insertRecon.run(row));
    payload.tables.targets.forEach((row) => insertTarget.run(row));
    payload.tables.relations.forEach((row) => insertRelation.run(row));
    payload.tables.scan_artifacts.forEach((row) => insertArtifact.run(row));
    payload.tables.node_attributes.forEach((row) => insertAttribute.run(row));

    const updateSettings = db.prepare(
      `UPDATE enrichment_settings
       SET live_enrichment_enabled = @live_enrichment_enabled,
           geo_enrichment_enabled = @geo_enrichment_enabled,
           tech_enrichment_enabled = @tech_enrichment_enabled,
           ai_assistant_enabled = @ai_assistant_enabled,
           ai_api_key = @ai_api_key,
           updated_at = @updated_at
       WHERE id = 1`,
    );
    const settingsRow = payload.tables.enrichment_settings[0];
    if (settingsRow) {
      updateSettings.run(settingsRow);
    }
  });

  runImport(parsed);
  return summarize(parsed);
};
