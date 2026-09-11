/**
 * Video manager — orchestrates video generation from scripts.
 */

import type { VideoProvider, VideoStoryboard, VideoScene, VideoGenerationRequest, VideoGenerationResult } from "./types";
import { createMockVideoProvider } from "./mock-video-provider";
import { emitEvent } from "@/lib/observability";

export class VideoManager {
  private providers: VideoProvider[] = [];

  constructor() {
    this.providers.push(createMockVideoProvider());
  }

  addProvider(provider: VideoProvider) {
    this.providers.push(provider);
  }

  getAvailableProvider(): VideoProvider | undefined {
    return this.providers.find((p) => p.isAvailable());
  }

  scriptToStoryboard(script: string, title?: string): VideoStoryboard {
    const sentences = script.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const scenesPerGroup = Math.max(1, Math.ceil(sentences.length / 5));
    const scenes: VideoScene[] = [];

    for (let i = 0; i < sentences.length; i += scenesPerGroup) {
      const group = sentences.slice(i, i + scenesPerGroup);
      scenes.push({
        id: `scene_${scenes.length + 1}`,
        description: group.join(". ").trim(),
        duration: Math.min(15, group.length * 5),
        narration: group.join(". ").trim(),
        caption: group.join(" ").trim(),
      });
    }

    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

    return {
      title: title || "Untitled Video",
      scenes,
      totalDuration,
    };
  }

  async generate(script: string, opts?: { style?: string; resolution?: string }): Promise<VideoGenerationResult> {
    const provider = this.getAvailableProvider();
    if (!provider) {
      return {
        id: "",
        status: "failed",
        error: "No video provider available",
      };
    }

    const storyboard = this.scriptToStoryboard(script);
    const request: VideoGenerationRequest = {
      script,
      storyboard,
      style: opts?.style,
      resolution: opts?.resolution,
    };

    emitEvent("video", "info", "video.requested", `Video generation requested: ${storyboard.scenes.length} scenes`, {
      meta: { provider: provider.id, scenes: storyboard.scenes.length, duration: storyboard.totalDuration },
    });

    const result = await provider.generate(request);

    emitEvent("video", "info", "video.completed", `Video generation ${result.status}: ${result.id}`, {
      meta: { provider: provider.id, videoId: result.id, status: result.status },
    });

    return result;
  }

  async checkStatus(id: string): Promise<VideoGenerationResult> {
    const provider = this.getAvailableProvider();
    if (!provider) {
      return { id, status: "failed", error: "No video provider available" };
    }
    return provider.checkStatus(id);
  }
}

export const videoManager = new VideoManager();
