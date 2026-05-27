// Builds a React-Flow graph from the XML data tree.
//
// Layout: horizontal XSD-diagram style (à la XMLSpy / Oxygen). A parent element
// sits on the same horizontal baseline as the vertical midpoint of its visible
// children, which are stacked to its right.
//
//   [root] ── child 1
//          ├─ child 2     ← parent centered on children's span
//          └─ child 3
//
// Algorithm: top-down x by depth, bottom-up y — children are laid out first and
// their combined vertical span fixes the parent's Y-center. Only children of
// nodes in `expandedIds` are emitted, so large documents stay collapsed.

import type { Edge, Node } from "@xyflow/react";
import type { ValidationErrorItem, XmlAttribute, XmlNode } from "../../types/model";

export const NODE_WIDTH = 240;

const X_GAP = 60;
const Y_GAP = 18;

// Pixel budget per node section. Approximates the line heights in
// XmlElementNode.tsx; keep in rough sync with that CSS so the layout doesn't
// overlap (exact measurement happens in the DOM after render).
const HEADER_H = 28;
const TEXT_H = 20;
const ATTR_ROW_H = 15;
const SECTION_PAD = 6;
const EXPAND_HINT_H = 16;
export const MAX_INLINE_ATTRS = 5;

export interface XmlNodeData {
  nodeId: string;
  kind: string;
  tag: string;
  attributes: XmlAttribute[];
  text: string | null;
  expandable: boolean;
  expanded: boolean;
  selected: boolean;
  hasError: boolean;
  errorCount: number;
  [key: string]: unknown;
}

interface Span {
  top: number;
  bottom: number;
  center: number;
}

interface Ctx {
  expandedIds: Set<string>;
  selectedId: string | null;
  errorsByNodeId: Map<string, ValidationErrorItem[]>;
  nodes: Node[];
  edges: Edge[];
}

function nodeHeight(node: XmlNode): number {
  let h = HEADER_H;
  if (node.text) h += TEXT_H + SECTION_PAD;
  if (node.attributes.length > 0) {
    const shown = Math.min(node.attributes.length, MAX_INLINE_ATTRS);
    const rows = shown + (node.attributes.length > MAX_INLINE_ATTRS ? 1 : 0);
    h += rows * ATTR_ROW_H + SECTION_PAD * 2;
  }
  if (node.children.length > 0) h += EXPAND_HINT_H;
  return h;
}

function pushNode(node: XmlNode, x: number, y: number, ctx: Ctx): void {
  const errors = ctx.errorsByNodeId.get(node.id);
  const data: XmlNodeData = {
    nodeId: node.id,
    kind: node.kind,
    tag: node.tag,
    attributes: node.attributes,
    text: node.text,
    expandable: node.children.length > 0,
    expanded: ctx.expandedIds.has(node.id),
    selected: ctx.selectedId === node.id,
    hasError: !!errors && errors.length > 0,
    errorCount: errors?.length ?? 0,
  };
  ctx.nodes.push({
    id: node.id,
    type: "xmlElement",
    position: { x, y },
    data,
    width: NODE_WIDTH,
    draggable: false,
  });
}

function layout(node: XmlNode, depth: number, topY: number, ctx: Ctx): Span {
  const h = nodeHeight(node);
  const x = depth * (NODE_WIDTH + X_GAP);
  const renderChildren = ctx.expandedIds.has(node.id) && node.children.length > 0;

  if (!renderChildren) {
    pushNode(node, x, topY, ctx);
    return { top: topY, bottom: topY + h, center: topY + h / 2 };
  }

  let cursor = topY;
  const childSpans: Span[] = [];
  for (const child of node.children) {
    const span = layout(child, depth + 1, cursor, ctx);
    childSpans.push(span);
    ctx.edges.push({
      id: `${node.id}->${child.id}`,
      source: node.id,
      target: child.id,
      type: "smoothstep",
    });
    cursor = span.bottom + Y_GAP;
  }

  const childrenTop = childSpans[0].top;
  const childrenBottom = childSpans[childSpans.length - 1].bottom;
  const center = (childrenTop + childrenBottom) / 2;
  const y = center - h / 2;
  pushNode(node, x, y, ctx);
  return {
    top: Math.min(y, childrenTop),
    bottom: Math.max(y + h, childrenBottom),
    center,
  };
}

export function buildDiagramGraph(
  root: XmlNode,
  expandedIds: Set<string>,
  selectedId: string | null,
  errorsByNodeId: Map<string, ValidationErrorItem[]>,
): { nodes: Node[]; edges: Edge[] } {
  const ctx: Ctx = {
    expandedIds,
    selectedId,
    errorsByNodeId,
    nodes: [],
    edges: [],
  };
  layout(root, 0, 0, ctx);
  return { nodes: ctx.nodes, edges: ctx.edges };
}
