import { defineConfig } from 'cf/config';
export default defineConfig({ worker: { name: 'bitgames-paint-a-planet', compatibilityDate: '2026-10-05', previewUrls: true, observability: { enabled: true, traces: { enabled: true, headSamplingRate: 0.1 } } } });
