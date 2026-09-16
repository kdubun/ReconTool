import type { LaidOutLink } from '@renderer/lib/radialLayout';

export const LINK_TREE = '#9fb0c8';
export const LINK_TREE_ACTIVE = '#fde68a';
export const LINK_CROSS = '#d6a15c';
export const LINK_CROSS_ACTIVE = '#fbbf24';
export const LINK_DIM = '#334155';

export const treeLinkStyle = (
  link: Pick<LaidOutLink, 'weight' | 'confidence'>,
  active: boolean,
): { stroke: string; width: number; opacity: number } => {
  if (active) {
    return { stroke: LINK_TREE_ACTIVE, width: 2, opacity: 0.95 };
  }
  return {
    stroke: LINK_TREE,
    width: 1.2 + link.weight / 14,
    opacity: 0.7 + link.confidence * 0.18,
  };
};

export const crossLinkStyle = (
  active: boolean,
): { stroke: string; width: number; opacity: number } => {
  if (active) {
    return { stroke: LINK_CROSS_ACTIVE, width: 1.35, opacity: 0.88 };
  }
  return { stroke: LINK_CROSS, width: 0.85, opacity: 0.45 };
};
