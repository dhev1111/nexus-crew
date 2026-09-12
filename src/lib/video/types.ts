/**
 * Video generation types.
 */

export interface VideoScene {
  id: string;
  description: string;
  duration: number;
  narration?: string;
  caption?: string;
  visual?: string;
}

export interface VideoStoryboard {
  title: string;
  scenes: VideoScene[];
  totalDuration: number;
  thumbnail?: string;
}

export interface VideoGenerationRequest {
  script: string;
  storyboard: VideoStoryboard;
  style?: string;
  resolution?: string;
}

export interface VideoGenerationResult {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  error?: string;
}

export interface VideoProvider {
  id: string;
  name: string;
  isAvailable(): boolean;
  generate(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
  checkStatus(id: string): Promise<VideoGenerationResult>;
}
