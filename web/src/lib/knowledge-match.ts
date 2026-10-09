import {
  IAC_SOLUTIONS,
  rankSolutionsForProspect,
  type IACSolution,
  type SolutionMatch,
} from "./iac-portfolio-knowledge";
import { ensureDb } from "./db";
import {
  collectDocumentServices,
  getKnowledgeProfile,
  listActiveBuyerPersonas,
  listActiveKnowledgeDocuments,
  profileToCompanyShape,
  type BuyerPersona,
  type KnowledgeDocumentRecord,
  type KnowledgeProfile,
} from "./knowledge-store";

const EXCERPT_BUDGET = 4500;
const CHUNK_SIZE = 700;

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTokens(query: string): string[] {
  const stop = new Set([
    "de", "del", "la", "las", "los", "el", "y", "en", "para", "con", "por", "un", "una", "the", "of", "and",
  ]);
  return fold(query)
    .split(" ")
    .filter((token) => token.length >= 4 && !stop.has(token));
}

function chunkText(text: string): string[] {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter((b) => b.length > 40);
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks.length ? blocks : [text]) {
    if ((current + "\n" + block).length > CHUNK_SIZE && current) {
      chunks.push(current);
      current = block;
    } else {
      current = current ? `${current}\n${block}` : block;
    }
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 80);
}

function scoreChunk(chunk: string, tokens: string[]): number {
  if (!tokens.length) return 1;
  const hay = fold(chunk);
  let hits = 0;
  for (const token of tokens) if (hay.includes(token)) hits++;
  return hits;
}

export function pickRelevantExcerpts(
  docs: KnowledgeDocumentRecord[],
  query: string,
  budget = EXCERPT_BUDGET
): { excerpt: string; sources: string[] } {
  const tokens = queryTokens(query);
  const ranked: Array<{ filename: string; text: string; score: number }> = [];

  for (const doc of docs) {
    for (const chunk of chunkText(doc.extracted_text)) {
      const score = scoreChunk(chunk, tokens);
      if (score <= 0 && tokens.length) continue;
      ranked.push({ filename: doc.filename, text: chunk, score: score || 0.2 });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  const sources = new Set<string>();
  let excerpt = "";
  for (const item of ranked) {
    const piece = `[${item.filename}]\n${item.text.trim()}`;
    if (excerpt.length + piece.length + 8 > budget) continue;
    excerpt = excerpt ? `${excerpt}\n\n${piece}` : piece;
    sources.add(item.filename);
    if (excerpt.length >= budget - 200) break;
  }

  if (!excerpt && docs[0]) {
    excerpt = `[${docs[0].filename}]\n${docs[0].extracted_text.slice(0, budget)}`;
    sources.add(docs[0].filename);
  }

  return { excerpt, sources: [...sources] };
}

function scoreCatalogSolution(solution: IACSolution, combined: string): SolutionMatch {
  let score = 0;
  const reasons: string[] = [];
  const hay = fold(combined);
  const name = fold(solution.name);
  if (name && hay.includes(name)) {
    score += 12;
    reasons.push(`menciona ${solution.name}`);
  }
  for (const word of name.split(" ").filter((w) => w.length >= 5)) {
    if (hay.includes(word)) score += 3;
  }
  for (const role of solution.fit_roles) {
    const token = fold(role);
    if (token.length >= 3 && hay.includes(token)) {
      score += 4;
      reasons.push(`rol ${role}`);
    }
  }
  for (const industry of solution.industries) {
    const token = fold(industry);
    if (token.length >= 3 && hay.includes(token)) {
      score += 4;
      reasons.push(`sector ${industry}`);
    }
  }
  for (const point of solution.talking_points) {
    const token = fold(point).split(" ").filter((w) => w.length >= 6)[0];
    if (token && hay.includes(token)) score += 2;
  }
  return { solution, score, reasons: [...new Set(reasons)] };
}

export function rankCatalogForProspect(
  catalog: IACSolution[],
  cargo: string | null | undefined,
  hints: string
): SolutionMatch[] {
  if (!catalog.length) return rankSolutionsForProspect(cargo, hints);
  const combined = `${cargo ?? ""} ${hints}`;
  const ranked = catalog
    .map((solution) => scoreCatalogSolution(solution, combined))
    .sort((a, b) => b.score - a.score);

  if ((ranked[0]?.score ?? 0) === 0) {
    return [
      {
        solution: catalog[0],
        score: 1,
        reasons: ["conocimiento del proyecto (sin señal fuerte de rol)"],
      },
      ...ranked.slice(1),
    ];
  }
  return ranked;
}

export function matchBuyerPersona(
  personas: BuyerPersona[],
  cargo: string | null | undefined,
  hints: string
): BuyerPersona | null {
  if (!personas.length) return null;
  const hay = fold(`${cargo ?? ""} ${hints}`);
  let best: { persona: BuyerPersona; score: number } | null = null;
  for (const persona of personas) {
    let score = 0;
    const roleTokens = queryTokens(`${persona.role} ${persona.name}`);
    const sectorTokens = queryTokens(persona.sector);
    const charTokens = queryTokens(persona.characteristics);
    for (const token of roleTokens) if (hay.includes(token)) score += 6;
    for (const token of sectorTokens) if (hay.includes(token)) score += 4;
    for (const token of charTokens) if (hay.includes(token)) score += 2;
    if (persona.role && fold(cargo ?? "").includes(fold(persona.role))) score += 8;
    if (!best || score > best.score) best = { persona, score };
  }
  if (!best || best.score < 6) return null;
  return best.persona;
}

export type LiveKnowledge = {
  profile: KnowledgeProfile;
  company: ReturnType<typeof profileToCompanyShape>;
  documents: KnowledgeDocumentRecord[];
  services: IACSolution[];
  personas: BuyerPersona[];
  fromDocuments: boolean;
};

export async function loadLiveKnowledge(): Promise<LiveKnowledge> {
  await ensureDb();
  const profile = await getKnowledgeProfile();
  const [documents, personas] = await Promise.all([
    listActiveKnowledgeDocuments(),
    listActiveBuyerPersonas(),
  ]);
  const services = collectDocumentServices(documents);
  return {
    profile,
    company: profileToCompanyShape(profile),
    documents,
    services,
    personas,
    fromDocuments: documents.length > 0,
  };
}

export function solutionsForKnowledge(live: LiveKnowledge): IACSolution[] {
  if (!live.fromDocuments) return IAC_SOLUTIONS;
  if (live.services.length) return live.services;
  const excerpt = live.documents[0]?.extracted_text.slice(0, 500) ?? live.profile.notes;
  return [
    {
      id: "project-knowledge",
      name: live.company.tagline || "Oferta del proyecto",
      summary: excerpt || "Servicios descritos en los documentos de conocimiento.",
      metrics: [],
      fit_roles: [],
      industries: live.company.sectors.map((s) => s.toLowerCase()),
      talking_points: live.profile.notes ? [live.profile.notes.slice(0, 180)] : [],
    },
  ];
}
