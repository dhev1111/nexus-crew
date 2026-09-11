/**
 * Analytics store — tracks metrics, generates insights.
 */

import type { MetricRecord, MetricType, ContentPerformance, Insight } from "./types";
import { emitEvent } from "@/lib/observability";

const metrics: MetricRecord[] = [];
const insights: Insight[] = [];

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export const analyticsStore = {
  recordMetric(type: MetricType, value: number, source: string, opts?: {
    platform?: string;
    contentId?: string;
    campaignId?: string;
    metadata?: Record<string, unknown>;
  }): MetricRecord {
    const record: MetricRecord = {
      id: genId("metric"),
      type,
      value,
      source,
      platform: opts?.platform,
      contentId: opts?.contentId,
      campaignId: opts?.campaignId,
      timestamp: Date.now(),
      metadata: opts?.metadata ?? {},
    };
    metrics.push(record);
    emitEvent("analytics", "info", "analytics.updated", `Metric recorded: ${type}=${value}`);
    return record;
  },

  getMetrics(opts?: {
    type?: MetricType;
    contentId?: string;
    platform?: string;
    since?: number;
  }): MetricRecord[] {
    let result = metrics;
    if (opts?.type) result = result.filter((m) => m.type === opts.type);
    if (opts?.contentId) result = result.filter((m) => m.contentId === opts.contentId);
    if (opts?.platform) result = result.filter((m) => m.platform === opts.platform);
    const since = opts?.since;
    if (since) result = result.filter((m) => m.timestamp >= since);
    return result;
  },

  getContentPerformance(contentId: string): ContentPerformance {
    const contentMetrics = metrics.filter((m) => m.contentId === contentId);
    const get = (type: MetricType) =>
      contentMetrics.filter((m) => m.type === type).reduce((sum, m) => sum + m.value, 0);

    const impressions = get("impressions");
    const views = get("views");
    const engagement = get("engagement");
    const clicks = get("clicks");
    const leads = get("leads");
    const conversions = get("conversions");
    const revenue = get("revenue");

    const score = impressions > 0
      ? ((engagement + clicks + leads * 5 + conversions * 10) / impressions) * 100
      : 0;

    return {
      contentId,
      platform: contentMetrics[0]?.platform || "unknown",
      impressions,
      views,
      engagement,
      clicks,
      leads,
      conversions,
      revenue,
      score: Math.round(score * 100) / 100,
    };
  },

  addInsight(insight: Omit<Insight, "id" | "timestamp">): Insight {
    const full: Insight = {
      ...insight,
      id: genId("insight"),
      timestamp: Date.now(),
    };
    insights.push(full);
    emitEvent("analytics", "info", "insight.generated", `Insight: ${full.title}`);
    return full;
  },

  getInsights(opts?: { type?: Insight["type"]; limit?: number }): Insight[] {
    let result = insights;
    if (opts?.type) result = result.filter((i) => i.type === opts.type);
    return result.slice(-(opts?.limit ?? 20));
  },

  generateInsights(): Insight[] {
    const recentMetrics = metrics.filter((m) => m.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newInsights: Insight[] = [];

    const byPlatform = new Map<string, MetricRecord[]>();
    for (const m of recentMetrics) {
      if (m.platform) {
        if (!byPlatform.has(m.platform)) byPlatform.set(m.platform, []);
        byPlatform.get(m.platform)!.push(m);
      }
    }

    for (const [platform, platformMetrics] of byPlatform) {
      const totalEngagement = platformMetrics
        .filter((m) => m.type === "engagement")
        .reduce((sum, m) => sum + m.value, 0);

      if (totalEngagement > 100) {
        newInsights.push(
          analyticsStore.addInsight({
            type: "pattern",
            title: `High engagement on ${platform}`,
            description: `${platform} shows strong engagement with ${totalEngagement} total interactions this week.`,
            confidence: 0.8,
            data: { platform, totalEngagement },
          })
        );
      }
    }

    return newInsights;
  },

  clear() {
    metrics.length = 0;
    insights.length = 0;
  },
};
