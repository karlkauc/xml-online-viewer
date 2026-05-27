import { create } from "zustand";
import type {
  ValidationErrorItem,
  ValidationResponse,
  XmlDocModel,
  XmlNode,
  XsdInfo,
} from "../types/model";

function collectExpandableIds(root: XmlNode): Set<string> {
  const ids = new Set<string>();
  const walk = (node: XmlNode) => {
    if (node.children.length > 0) {
      ids.add(node.id);
      node.children.forEach(walk);
    }
  };
  walk(root);
  return ids;
}

function indexErrors(
  errors: ValidationErrorItem[],
): Map<string, ValidationErrorItem[]> {
  const map = new Map<string, ValidationErrorItem[]>();
  for (const err of errors) {
    if (!err.node_id) continue;
    const list = map.get(err.node_id);
    if (list) list.push(err);
    else map.set(err.node_id, [err]);
  }
  return map;
}

interface AppState {
  xmlDoc: XmlDocModel | null;
  xsdInfo: XsdInfo | null;
  validation: ValidationResponse | null;
  errorsByNodeId: Map<string, ValidationErrorItem[]>;

  expandedIds: Set<string>;
  selectedNodeId: string | null;
  searchQuery: string;

  setXml: (doc: XmlDocModel) => void;
  setXsd: (info: XsdInfo) => void;
  setValidation: (result: ValidationResponse) => void;
  clearValidation: () => void;
  toggleExpanded: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  setSelected: (id: string | null) => void;
  setSearch: (q: string) => void;
}

export const useApp = create<AppState>((set, get) => ({
  xmlDoc: null,
  xsdInfo: null,
  validation: null,
  errorsByNodeId: new Map(),

  expandedIds: new Set(),
  selectedNodeId: null,
  searchQuery: "",

  setXml: (doc) =>
    set({
      xmlDoc: doc,
      // Expand the first two levels by default for a useful initial view.
      expandedIds: new Set([
        doc.root.id,
        ...doc.root.children.filter((c) => c.children.length).map((c) => c.id),
      ]),
      selectedNodeId: null,
      validation: null,
      errorsByNodeId: new Map(),
    }),

  setXsd: (info) => set({ xsdInfo: info, validation: null, errorsByNodeId: new Map() }),

  setValidation: (result) =>
    set({ validation: result, errorsByNodeId: indexErrors(result.errors) }),

  clearValidation: () => set({ validation: null, errorsByNodeId: new Map() }),

  toggleExpanded: (id) => {
    const next = new Set(get().expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ expandedIds: next });
  },

  expandAll: () => {
    const doc = get().xmlDoc;
    if (doc) set({ expandedIds: collectExpandableIds(doc.root) });
  },

  collapseAll: () => set({ expandedIds: new Set() }),

  setSelected: (id) => set({ selectedNodeId: id }),

  setSearch: (q) => set({ searchQuery: q }),
}));
