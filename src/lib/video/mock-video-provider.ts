/**
 * Mock video provider — always available, returns simulated results.
 */

import type { VideoProvider, VideoGenerationRequest, VideoGenerationResult } from "./types";

export function createMockVideoProvider(): VideoProvider {
  return {
    id: "mock-video",
    name: "Mock Video Provider",
    isAvailable: () => true,

    async generate(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
      const id = `video_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      await new Promise((r) => setTimeout(r, 100));

      return {
        id,
        status: "completed",
        videoUrl: `mock://videos/${id}.mp4`,
        thumbnailUrl: `mock://thumbnails/${id}.jpg`,
        duration: request.storyboard.totalDuration || 60,
      };
    },

    async checkStatus(id: string): Promise<VideoGenerationResult> {
      return {
        id,
        status: "completed",
        videoUrl: `mock://videos/${id}.mp4`,
        thumbnailUrl: `mock://thumbnails/${id}.jpg`,
        duration: 60,
      };
    },
  };
}
