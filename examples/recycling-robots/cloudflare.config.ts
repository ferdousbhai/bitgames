import { defineConfig } from 'cf/config';
export default defineConfig({ worker: { name: 'bitgames-recycling-robots', compatibilityDate: '2026-10-05', previewUrls: true, observability: { enabled: true, traces: { enabled: true, headSamplingRate: 0.1 } } } });
