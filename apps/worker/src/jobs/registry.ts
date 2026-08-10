import type { JobHandler } from './types.js';
import { integrationTestHandler } from './integration-test.js';
import { handleAssetIngest } from './asset-ingest.js';
import { handleMediaPreprocess } from './media-preprocess.js';
import { handleSubtitleParse } from './subtitle-parse.js';
import { handleSubtitleTranslate } from './subtitle-translate.js';
import { handleTranscriptionOrchestrate } from './transcription-orchestrate.js';
import { handleTtsSynthesize } from './tts-synthesize.js';
import { handleTtsPreview } from './tts-preview.js';
import { handleVideoRender } from './video-render.js';
import { handleVideoPipeline } from './video-pipeline.js';
import { handleShadowWorkflow } from './shadow-workflow.js';

interface JobRegistryEntry {
  handler: JobHandler;
  enabled: boolean;
}

const registry: Record<string, JobRegistryEntry> = {
  integration_test: {
    handler: integrationTestHandler,
    enabled: true,
  },
  asset_ingest: {
    handler: handleAssetIngest,
    enabled: true,
  },
  media_preprocess: {
    handler: handleMediaPreprocess,
    enabled: true,
  },
  subtitle_parse: {
    handler: handleSubtitleParse,
    enabled: true,
  },
  subtitle_translate: {
    handler: handleSubtitleTranslate,
    enabled: true,
  },
  transcription_orchestrate: {
    handler: handleTranscriptionOrchestrate,
    enabled: true,
  },
  tts_synthesize: {
    handler: handleTtsSynthesize,
    enabled: true,
  },
  tts_preview: {
    handler: handleTtsPreview,
    enabled: true,
  },
  workflow_execute: {
    handler: async () => { throw new Error('workflow_execute handler not implemented'); },
    enabled: false,
  },
  video_render: {
    handler: handleVideoRender,
    enabled: true,
  },
  video_pipeline: {
    handler: handleVideoPipeline,
    enabled: true,
  },
  shadow_workflow: {
    handler: handleShadowWorkflow,
    enabled: true,
  },
};

export function getJobHandler(jobType: string): JobHandler {
  const entry = registry[jobType];

  if (!entry) {
    throw new Error(`Unknown job type: ${jobType}`);
  }

  if (!entry.enabled) {
    throw new Error(`Job type '${jobType}' is registered but disabled`);
  }

  return entry.handler;
}

export function getRegisteredJobTypes(): string[] {
  return Object.keys(registry);
}

export function isJobTypeEnabled(jobType: string): boolean {
  return registry[jobType]?.enabled ?? false;
}
