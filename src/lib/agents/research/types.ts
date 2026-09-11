/**
 * Research agent types.
 */

export type EvidenceType = "fact" | "inference" | "unknown";

export interface ResearchSource {
  url: string;
  title: string;
  snippet: string;
  retrievedAt: number;
  isValid: boolean;
  confidence: number;
}

export interface ResearchEvidence {
  claim: string;
  type: EvidenceType;
  source?: string;
  confidence: number;
}

export interface ResearchFinding {
  statement: string;
  evidence: ResearchEvidence[];
  confidence: number;
  sources: string[];
}

export interface ResearchOutput {
  query: string;
  sources: ResearchSource[];
  findings: ResearchFinding[];
  evidence: ResearchEvidence[];
  confidence: number;
  citations: string[];
  timestamp: number;
  summary: string;
}

export interface ResearchAgent {
  id: string;
  name: string;
  execute(query: string, context?: string): Promise<ResearchOutput>;
}
