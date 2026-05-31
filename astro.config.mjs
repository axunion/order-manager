// @ts-check
import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

import solidJs from '@astrojs/solid-js';

export default defineConfig({
  adapter: cloudflare(),
  integrations: [solidJs()],
});