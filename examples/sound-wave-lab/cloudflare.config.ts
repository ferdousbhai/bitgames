import { defineConfig } from 'cf/config';
export default defineConfig({ worker: { name: 'bitgames-sound-wave-lab', compatibilityDate: '2026-10-05', previewUrls: true, observability: { enabled: true, traces: { enabled: true, headSamplingRate: 0.1 } } } });
