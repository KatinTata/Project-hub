import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: [
        'client/src/utils.js',
        'client/src/utils/stacks.js',
        'client/src/utils/forecast.js',
        'client/src/utils/capacity.js',
        'server/aiUsage/pricing.js',
        'server/aiUsage/fx.js',
      ],
    },
  },
})
