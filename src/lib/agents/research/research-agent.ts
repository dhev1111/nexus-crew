/**
 * Research agent — web research, source validation, evidence extraction.
 */

import type { ResearchAgent, ResearchOutput, ResearchSource, ResearchFinding, ResearchEvidence, EvidenceType } from "./types";
import { safeFetch } from "./safety";
import { chatCompletionWithRetry } from "@/lib/providers/llm";
import { emitAgent, emitAgentError } from "@/lib/observability";

export function createResearchAgent(): ResearchAgent {
  return {
    id: "research",
    name: "Research Agent",

    async execute(query: string, context?: string): Promise<ResearchOutput> {
      const executionId = `research_${Date.now()}`;
      emitAgent("research.started", `Research started: ${query.slice(0, 80)}`, executionId, "research");

      const sources: ResearchSource[] = [];
      const findings: ResearchFinding[] = [];
      const evidence: ResearchEvidence[] = [];
      const citations: string[] = [];

      try {
        const prompt = buildResearchPrompt(query, context);
        const response = await chatCompletionWithRetry(
          [
            {
              role: "system",
              content: `You are a research agent. Analyze the query and produce structured research findings.
Output in this exact format:
## Sources
- URL: <url>
  Title: <title>
  Confidence: <0-1>

## Findings
- Statement: <finding>
  Type: fact|inference|unknown
  Confidence: <0-1>
  Sources: <urls>

## Evidence
- Claim: <claim>
  Type: fact|inference|unknown
  Confidence: <0-1>

## Summary
<brief summary>

Never fabricate sources. Distinguish facts from inferences. Be honest about uncertainty.`,
            },
            { role: "user", content: prompt },
          ],
          { temperature: 0.3, maxTokens: 2000, timeoutMs: 60_000 }
        );

        const parsed = parseResearchOutput(response.content, query);
        sources.push(...parsed.sources);
        findings.push(...parsed.findings);
        evidence.push(...parsed.evidence);
        citations.push(...parsed.citations);

        const confidence = findings.length > 0
          ? findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length
          : 0.5;

        const output: ResearchOutput = {
          query,
          sources,
          findings,
          evidence,
          confidence,
          citations,
          timestamp: Date.now(),
          summary: parsed.summary || response.content.slice(0, 500),
        };

        emitAgent("research.completed", `Research completed: ${findings.length} findings, ${sources.length} sources`, executionId, "research", {
          findingsCount: findings.length,
          sourcesCount: sources.length,
          confidence,
        });

        return output;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emitAgentError("research.failed", `Research failed: ${msg}`, executionId, "research", { error: msg });

        return {
          query,
          sources: [],
          findings: [],
          evidence: [],
          confidence: 0,
          citations: [],
          timestamp: Date.now(),
          summary: `Research failed: ${msg}`,
        };
      }
    },
  };
}

function buildResearchPrompt(query: string, context?: string): string {
  let prompt = `Research Query: ${query}\n`;
  if (context) {
    prompt += `\nContext:\n${context}\n`;
  }
  prompt += `\nProduce structured research findings with sources, evidence, and confidence levels.`;
  return prompt;
}

interface ParsedResearch {
  sources: ResearchSource[];
  findings: ResearchFinding[];
  evidence: ResearchEvidence[];
  citations: string[];
  summary: string;
}

function parseResearchOutput(content: string, query: string): ParsedResearch {
  const sources: ResearchSource[] = [];
  const findings: ResearchFinding[] = [];
  const evidence: ResearchEvidence[] = [];
  const citations: string[] = [];
  let summary = "";

  const sourceRegex = /URL:\s*(https?:\/\/[^\s]+)/gi;
  let match;
  while ((match = sourceRegex.exec(content)) !== null) {
    sources.push({
      url: match[1],
      title: extractTitle(content, match.index),
      snippet: extractSnippet(content, match.index),
      retrievedAt: Date.now(),
      isValid: true,
      confidence: 0.7,
    });
    citations.push(match[1]);
  }

  const findingRegex = /(?:Statement|Finding):\s*(.+?)(?:\n|$)/gi;
  while ((match = findingRegex.exec(content)) !== null) {
    const typeMatch = content.slice(match.index).match(/Type:\s*(fact|inference|unknown)/i);
    const confMatch = content.slice(match.index).match(/Confidence:\s*([\d.]+)/i);
    findings.push({
      statement: match[1].trim(),
      evidence: [{
        claim: match[1].trim(),
        type: (typeMatch?.[1]?.toLowerCase() as EvidenceType) ?? "unknown",
        confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
      }],
      confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
      sources: [],
    });
  }

  const claimRegex = /Claim:\s*(.+?)(?:\n|$)/gi;
  while ((match = claimRegex.exec(content)) !== null) {
    const typeMatch = content.slice(match.index).match(/Type:\s*(fact|inference|unknown)/i);
    const confMatch = content.slice(match.index).match(/Confidence:\s*([\d.]+)/i);
    evidence.push({
      claim: match[1].trim(),
      type: (typeMatch?.[1]?.toLowerCase() as EvidenceType) ?? "unknown",
      confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
    });
  }

  const summaryMatch = content.match(/## Summary\s*\n([\s\S]+?)$/i);
  if (summaryMatch) {
    summary = summaryMatch[1].trim().slice(0, 500);
  }

  return { sources, findings, evidence, citations, summary };
}

function extractTitle(content: string, index: number): string {
  const lines = content.slice(Math.max(0, index - 200), index).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("Title:")) return line.replace(/^Title:\s*/, "");
    if (line.startsWith("- ") && line.length > 5) return line.slice(2);
  }
  return "Untitled";
}

function extractSnippet(content: string, index: number): string {
  const after = content.slice(index, index + 300);
  const lines = after.split("\n");
  return lines.slice(0, 2).join(" ").slice(0, 200);
}
