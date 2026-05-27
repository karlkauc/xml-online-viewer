import type { XmlNode } from "../../types/model";

export interface TreeRow {
  node: XmlNode;
  depth: number;
  hasChildren: boolean;
}

/**
 * Flatten the XML tree into the list of currently visible rows, honoring the
 * set of expanded node ids. When a search query is given, only nodes on a path
 * to a match are kept (matched nodes plus their ancestors), and matching
 * branches are force-expanded so hits are visible.
 */
export function buildTreeRows(
  root: XmlNode,
  expandedIds: Set<string>,
  query: string,
): TreeRow[] {
  const q = query.trim().toLowerCase();

  const matches = (node: XmlNode): boolean => {
    if (!q) return false;
    if (node.tag.toLowerCase().includes(q)) return true;
    if (node.text && node.text.toLowerCase().includes(q)) return true;
    return node.attributes.some(
      (a) =>
        a.name.toLowerCase().includes(q) || a.value.toLowerCase().includes(q),
    );
  };

  // Pre-compute which subtrees contain a match so we can prune.
  const onMatchPath = new Set<string>();
  if (q) {
    const mark = (node: XmlNode): boolean => {
      let hit = matches(node);
      for (const child of node.children) {
        if (mark(child)) hit = true;
      }
      if (hit) onMatchPath.add(node.id);
      return hit;
    };
    mark(root);
  }

  const rows: TreeRow[] = [];
  const walk = (node: XmlNode, depth: number) => {
    if (q && !onMatchPath.has(node.id)) return;
    const hasChildren = node.children.length > 0;
    rows.push({ node, depth, hasChildren });
    const expanded = q ? true : expandedIds.has(node.id);
    if (hasChildren && expanded) {
      for (const child of node.children) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}
