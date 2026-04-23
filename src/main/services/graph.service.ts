import { getDatabase } from '@main/database/init';
import type {
  DeleteGraphNodeResponse,
  GraphFilters,
  GraphMetrics,
  GraphNodeDetails,
  GraphNodeType,
  GraphSourceType,
  GraphData,
  Relation,
  Target,
} from '@shared/types';

type TargetRow = {
  id: number;
  value: string;
  type: string;
  category: string | null;
  display_name: string | null;
  first_seen: string | null;
  last_seen: string | null;
  tags_json: string | null;
  risk_score: number | null;
};

type RelationRow = {
  id: number;
  source_id: number;
  target_id: number;
  type: string;
  weight: number | null;
  confidence: number | null;
  first_seen: string | null;
  last_seen: string | null;
  source: string | null;
  scan_id: number | null;
  evidence_json: string | null;
};

type RelationCountRow = {
  count: number;
};

type NodeTypeCountRow = {
  type: string;
  count: number;
};

const GRAPH_NODE_TYPES: GraphNodeType[] = [
  'domain',
  'ip',
  'email',
  'subdomain',
  'asn',
  'org',
  'nameserver',
  'mx',
  'url',
  'cidr',
  'registrar',
  'phone',
  'country',
  'city',
  'tech',
];
const HOST_LIKE_NODE_TYPES: GraphNodeType[] = ['domain', 'subdomain', 'nameserver', 'mx'];

const isGraphNodeType = (value: string): value is GraphNodeType =>
  GRAPH_NODE_TYPES.includes(value as GraphNodeType);

const isGraphSourceType = (value: string): value is GraphSourceType =>
  value === 'passive' || value === 'live' || value === 'manual';

const parseJsonArray = (value: string | null): string[] => {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

const normalizeTargetValue = (value: string, type: GraphNodeType): string => {
  const trimmed = value.trim();
  const withoutTrailingDot =
    HOST_LIKE_NODE_TYPES.includes(type) && trimmed.endsWith('.')
      ? trimmed.slice(0, -1)
      : trimmed;
  if (
    type === 'domain' ||
    type === 'subdomain' ||
    type === 'email' ||
    type === 'url' ||
    type === 'nameserver' ||
    type === 'mx' ||
    type === 'registrar' ||
    type === 'tech' ||
    type === 'org' ||
    type === 'country' ||
    type === 'city'
  ) {
    return withoutTrailingDot.toLowerCase();
  }
  return withoutTrailingDot;
};

const mapTargetRow = (row: TargetRow): Target | null => {
  if (!isGraphNodeType(row.type)) {
    return null;
  }
  return {
    id: row.id,
    value: row.value,
    type: row.type,
    category: row.category ?? undefined,
    displayName: row.display_name ?? undefined,
    firstSeen: row.first_seen ?? undefined,
    lastSeen: row.last_seen ?? undefined,
    tags: parseJsonArray(row.tags_json),
    riskScore: row.risk_score ?? undefined,
  };
};

const mapRelationRow = (row: RelationRow): Relation => ({
  id: row.id,
  source_id: row.source_id,
  target_id: row.target_id,
  type: row.type,
  weight: row.weight ?? undefined,
  confidence: row.confidence ?? undefined,
  firstSeen: row.first_seen ?? undefined,
  lastSeen: row.last_seen ?? undefined,
  source:
    row.source && isGraphSourceType(row.source) ? row.source : undefined,
  scanId: row.scan_id,
  evidence: parseJsonArray(row.evidence_json),
});

interface CreateTargetOptions {
  category?: string;
  displayName?: string;
  tags?: string[];
  riskScore?: number;
}

interface CreateRelationOptions {
  confidence?: number;
  source?: GraphSourceType;
  scanId?: number | null;
  evidence?: string[];
}

export const createTarget = (
  value: string,
  type: GraphNodeType,
  options: CreateTargetOptions = {},
): Target => {
  const db = getDatabase();
  const normalizedValue = normalizeTargetValue(value, type);
  const category = options.category ?? type;
  const displayName = options.displayName ?? normalizedValue;
  const tagsJson = JSON.stringify(options.tags ?? []);
  const riskScore = options.riskScore ?? 0;

  const findByValueAndType = (lookupType: GraphNodeType): Target | null => {
    const row = db
      .prepare<[string, GraphNodeType], TargetRow>(
        `SELECT id, value, type, category, display_name, first_seen, last_seen, tags_json, risk_score
         FROM targets WHERE value = ? AND type = ?`,
      )
      .get(normalizedValue, lookupType);
    return row ? mapTargetRow(row) : null;
  };

  // Keep one canonical node for hostname-like values to avoid graph splits
  // (e.g. same FQDN previously seen as mx then later scanned as domain).
  if (HOST_LIKE_NODE_TYPES.includes(type)) {
    const existingDomain = findByValueAndType('domain');
    if (existingDomain) {
      db.prepare<[number, string, string, string, number]>(
        `UPDATE targets
         SET category = ?, display_name = ?, tags_json = ?, risk_score = ?, last_seen = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(category, displayName, tagsJson, riskScore, existingDomain.id);
      return {
        ...existingDomain,
        category,
        displayName,
        tags: parseJsonArray(tagsJson),
        riskScore,
      };
    }

    if (type === 'domain') {
      const existingHostLike = HOST_LIKE_NODE_TYPES
        .filter((entry) => entry !== 'domain')
        .map((entry) => findByValueAndType(entry))
        .find((entry): entry is Target => entry !== null);

      if (existingHostLike) {
        db.prepare<[string, string, string, number, number]>(
          `UPDATE targets
           SET type = 'domain',
               category = ?,
               display_name = ?,
               tags_json = ?,
               risk_score = ?,
               last_seen = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(category, displayName, tagsJson, riskScore, existingHostLike.id);

        const promoted = findByValueAndType('domain');
        if (promoted) {
          return promoted;
        }
      }
    }
  }

  db.prepare(
    `INSERT INTO targets (value, type, category, display_name, tags_json, risk_score)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(value, type) DO UPDATE SET
       category = excluded.category,
       display_name = excluded.display_name,
       tags_json = excluded.tags_json,
       risk_score = excluded.risk_score,
       last_seen = CURRENT_TIMESTAMP`,
  ).run(normalizedValue, type, category, displayName, tagsJson, riskScore);

  const row = db
    .prepare<[string, GraphNodeType], TargetRow>(
      `SELECT id, value, type, category, display_name, first_seen, last_seen, tags_json, risk_score
       FROM targets WHERE value = ? AND type = ?`,
    )
    .get(normalizedValue, type);

  const mapped = row ? mapTargetRow(row) : null;
  if (!mapped) {
    throw new Error('Unable to create target');
  }

  return mapped;
};

export const createRelation = (
  sourceId: number,
  targetId: number,
  relationType: string,
  options: CreateRelationOptions = {},
): Relation => {
  const db = getDatabase();
  const confidence = options.confidence ?? 0.6;
  const source = options.source ?? 'passive';
  const scanId = options.scanId ?? null;
  const evidence = JSON.stringify(options.evidence ?? []);

  db.prepare(
    `INSERT INTO relations (source_id, target_id, type, weight, confidence, source, scan_id, evidence_json)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(source_id, target_id, type) DO UPDATE SET
       weight = relations.weight + 1,
       confidence = CASE WHEN excluded.confidence > relations.confidence
         THEN excluded.confidence ELSE relations.confidence END,
       source = excluded.source,
       scan_id = excluded.scan_id,
       evidence_json = excluded.evidence_json,
       last_seen = CURRENT_TIMESTAMP`,
  ).run(sourceId, targetId, relationType, confidence, source, scanId, evidence);

  const row = db
    .prepare<[number, number, string], RelationRow>(
      `SELECT id, source_id, target_id, type, weight, confidence, first_seen, last_seen, source, scan_id, evidence_json
       FROM relations
       WHERE source_id = ? AND target_id = ? AND type = ?`,
    )
    .get(sourceId, targetId, relationType);

  if (!row) {
    throw new Error('Unable to create relation');
  }

  return {
    ...mapRelationRow(row),
  };
};

const buildWhereClause = (filters?: GraphFilters): { where: string; params: unknown[] } => {
  if (!filters) {
    return { where: '', params: [] };
  }

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.query) {
    clauses.push('(LOWER(value) LIKE ? OR LOWER(display_name) LIKE ?)');
    const query = `%${filters.query.toLowerCase()}%`;
    params.push(query, query);
  }
  if (filters.nodeTypes && filters.nodeTypes.length > 0) {
    clauses.push(`type IN (${filters.nodeTypes.map(() => '?').join(', ')})`);
    params.push(...filters.nodeTypes);
  }
  if (filters.fromDate) {
    clauses.push('datetime(last_seen) >= datetime(?)');
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    clauses.push('datetime(last_seen) <= datetime(?)');
    params.push(filters.toDate);
  }

  if (clauses.length === 0) {
    return { where: '', params };
  }
  return { where: `WHERE ${clauses.join(' AND ')}`, params };
};

export const getGraph = (filters?: GraphFilters): GraphData => {
  const db = getDatabase();
  const { where, params } = buildWhereClause(filters);
  const targets = db
    .prepare(
      `SELECT id, value, type, category, display_name, first_seen, last_seen, tags_json, risk_score
       FROM targets ${where}`,
    )
    .all(...params)
    .map((row) => mapTargetRow(row as TargetRow))
    .filter((row): row is Target => row !== null);

  const targetIds = targets.map((target) => target.id);
  if (targetIds.length === 0) {
    return { nodes: [], edges: [] };
  }
  const placeholders = targetIds.map(() => '?').join(', ');
  const edgeParams: unknown[] = [...targetIds, ...targetIds];
  if (typeof filters?.minConfidence === 'number') {
    edgeParams.push(filters.minConfidence);
  }
  if (filters?.source && filters.source !== 'all') {
    edgeParams.push(filters.source);
  }
  const confidenceClause =
    typeof filters?.minConfidence === 'number' ? 'AND confidence >= ?' : '';
  const sourceClause =
    filters?.source && filters.source !== 'all' ? 'AND source = ?' : '';

  const relations = db
    .prepare(
      `SELECT id, source_id, target_id, type, weight, confidence, first_seen, last_seen, source, scan_id, evidence_json
       FROM relations
       WHERE source_id IN (${placeholders}) AND target_id IN (${placeholders})
       ${confidenceClause}
       ${sourceClause}`,
    )
    .all(...edgeParams)
    .map((row) => mapRelationRow(row as RelationRow));

  return {
    nodes: targets,
    edges: relations,
  };
};

export const getGraphMetrics = (): GraphMetrics => {
  const db = getDatabase();
  const nodeCount = Number(
    (db.prepare('SELECT COUNT(*) AS count FROM targets').get() as RelationCountRow).count,
  );
  const edgeCount = Number(
    (db.prepare('SELECT COUNT(*) AS count FROM relations').get() as RelationCountRow).count,
  );
  const avgConfidence = Number(
    (
      db.prepare('SELECT COALESCE(AVG(confidence), 0) AS count FROM relations').get() as RelationCountRow
    ).count,
  );
  const avgWeight = Number(
    (db.prepare('SELECT COALESCE(AVG(weight), 0) AS count FROM relations').get() as RelationCountRow)
      .count,
  );
  const topNodeTypes = db
    .prepare<[], NodeTypeCountRow>(
      `SELECT type, COUNT(*) as count
       FROM targets
       GROUP BY type
       ORDER BY count DESC
       LIMIT 6`,
    )
    .all()
    .filter((row): row is NodeTypeCountRow => isGraphNodeType(row.type))
    .map((row) => ({
      type: row.type as GraphNodeType,
      count: row.count,
    }));

  return {
    nodeCount,
    edgeCount,
    avgConfidence,
    avgWeight,
    topNodeTypes,
  };
};

export const getNodeDetails = (nodeId: number): GraphNodeDetails | null => {
  const db = getDatabase();
  const nodeRow = db
    .prepare<[number], TargetRow>(
      `SELECT id, value, type, category, display_name, first_seen, last_seen, tags_json, risk_score
       FROM targets WHERE id = ?`,
    )
    .get(nodeId);
  const node = nodeRow ? mapTargetRow(nodeRow) : null;
  if (!node) {
    return null;
  }
  const edgeRows = db
    .prepare<[number, number], RelationRow>(
      `SELECT id, source_id, target_id, type, weight, confidence, first_seen, last_seen, source, scan_id, evidence_json
       FROM relations
       WHERE source_id = ? OR target_id = ?`,
    )
    .all(nodeId, nodeId)
    .map((row) => mapRelationRow(row));

  const neighborIds = [
    ...new Set(
      edgeRows.map((edge) => (edge.source_id === nodeId ? edge.target_id : edge.source_id)),
    ),
  ];
  const neighbors =
    neighborIds.length === 0
      ? []
      : db
          .prepare(
            `SELECT id, value, type, category, display_name, first_seen, last_seen, tags_json, risk_score
             FROM targets
             WHERE id IN (${neighborIds.map(() => '?').join(', ')})`,
          )
          .all(...neighborIds)
          .map((row) => mapTargetRow(row as TargetRow))
          .filter((row): row is Target => row !== null);

  return {
    node,
    neighbors,
    edges: edgeRows,
  };
};

export const focusGraph = (nodeId: number, hops: 1 | 2): GraphData => {
  const db = getDatabase();
  const visited = new Set<number>([nodeId]);
  let frontier = new Set<number>([nodeId]);

  for (let depth = 0; depth < hops; depth += 1) {
    const nextFrontier = new Set<number>();
    frontier.forEach((currentId) => {
      const edges = db
        .prepare<[number, number], RelationRow>(
          `SELECT id, source_id, target_id, type, weight, confidence, first_seen, last_seen, source, scan_id, evidence_json
           FROM relations
           WHERE source_id = ? OR target_id = ?`,
        )
        .all(currentId, currentId);
      edges.forEach((edge) => {
        const neighborId = edge.source_id === currentId ? edge.target_id : edge.source_id;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          nextFrontier.add(neighborId);
        }
      });
    });
    frontier = nextFrontier;
    if (frontier.size === 0) {
      break;
    }
  }

  const nodeIds = [...visited];
  if (nodeIds.length === 0) {
    return { nodes: [], edges: [] };
  }
  const placeholders = nodeIds.map(() => '?').join(', ');
  const nodes = db
    .prepare(
      `SELECT id, value, type, category, display_name, first_seen, last_seen, tags_json, risk_score
       FROM targets
       WHERE id IN (${placeholders})`,
    )
    .all(...nodeIds)
    .map((row) => mapTargetRow(row as TargetRow))
    .filter((row): row is Target => row !== null);
  const edges = db
    .prepare(
      `SELECT id, source_id, target_id, type, weight, confidence, first_seen, last_seen, source, scan_id, evidence_json
       FROM relations
       WHERE source_id IN (${placeholders}) AND target_id IN (${placeholders})`,
    )
    .all(...nodeIds, ...nodeIds)
    .map((row) => mapRelationRow(row as RelationRow));

  return { nodes, edges };
};

export const clearGraph = (): void => {
  const db = getDatabase();
  db.exec(`
    DELETE FROM relations;
    DELETE FROM targets;
  `);
};

export const deleteNodeFromGraph = (
  nodeId: number,
  deleteUniqueNeighbors: boolean,
): DeleteGraphNodeResponse => {
  const db = getDatabase();
  const node = db
    .prepare<[number], TargetRow>('SELECT id, value, type FROM targets WHERE id = ?')
    .get(nodeId);

  if (!node || !isGraphNodeType(node.type)) {
    return {
      deletedNodeIds: [],
      deletedRelationCount: 0,
    };
  }

  const relations = db
    .prepare<[number, number], RelationRow>(
      `SELECT id, source_id, target_id, type
       FROM relations
       WHERE source_id = ? OR target_id = ?`,
    )
    .all(nodeId, nodeId);

  const neighborIds = [
    ...new Set(
      relations.map((relation) =>
        relation.source_id === nodeId ? relation.target_id : relation.source_id,
      ),
    ),
  ];

  const uniqueNeighborIds = neighborIds.filter((neighborId) => {
    const degree = db
      .prepare<[number], RelationCountRow>(
        `SELECT COUNT(*) as count
         FROM relations
         WHERE source_id = ? OR target_id = ?`,
      )
      .get(neighborId)?.count;
    return degree === 1;
  });

  const nodesToDelete = [
    nodeId,
    ...(deleteUniqueNeighbors ? uniqueNeighborIds : []),
  ];
  const placeholders = nodesToDelete.map(() => '?').join(', ');

  const targetsToDelete = db
    .prepare(
      `SELECT id, value, type
       FROM targets
       WHERE id IN (${placeholders})`,
    )
    .all(...nodesToDelete) as TargetRow[];

  const relationDeleteResult = db
    .prepare(
      `DELETE FROM relations
       WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`,
    )
    .run(...nodesToDelete, ...nodesToDelete);

  db.prepare(`DELETE FROM targets WHERE id IN (${placeholders})`).run(...nodesToDelete);

  const validTargets = targetsToDelete.filter((target): target is TargetRow =>
    isGraphNodeType(target.type),
  );

  const deleteReconByTarget = db.prepare<[string, string]>(
    'DELETE FROM recon_results WHERE LOWER(target) = LOWER(?) AND type = ?',
  );
  const deleteScanArtifactsByTarget = db.prepare<[string, string]>(
    `DELETE FROM scan_artifacts
     WHERE scan_id IN (
       SELECT id FROM recon_results WHERE LOWER(target) = LOWER(?) AND type = ?
     )`,
  );
  validTargets.forEach((target) => {
    deleteScanArtifactsByTarget.run(target.value, target.type);
    deleteReconByTarget.run(target.value, target.type);
  });

  return {
    deletedNodeIds: nodesToDelete,
    deletedRelationCount: relationDeleteResult.changes,
  };
};
