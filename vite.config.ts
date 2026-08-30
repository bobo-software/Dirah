import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * BlockSuite 0.19 still imports the misspelled CheckBoxCkeckSolidIcon.
 * @blocksuite/icons 2.2+ only exports CheckBoxCheckSolidIcon.
 */
function blocksuiteIconTypoPlugin(): Plugin {
  return {
    name: 'blocksuite-icon-typo',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('node_modules/@blocksuite') || !code.includes('CheckBoxCkeckSolidIcon')) {
        return null
      }
      return {
        code: code.replaceAll('CheckBoxCkeckSolidIcon', 'CheckBoxCheckSolidIcon'),
        map: null,
      }
    },
  }
}

export default defineConfig({
  plugins: [blocksuiteIconTypoPlugin(), react()],
  server: {
    port: 5181,
    host: true,
  },
  optimizeDeps: {
    include: [
      '@blocksuite/presets',
      '@blocksuite/presets/effects',
      '@blocksuite/blocks',
      '@blocksuite/blocks/effects',
      '@blocksuite/blocks/schemas',
      '@blocksuite/store',
      '@blocksuite/sync',
      '@blocksuite/data-view',
      'yjs',
      'y-indexeddb',
      'lit',
      'lodash.clonedeep',
    ],
    needsInterop: ['lodash.clonedeep', 'lodash.merge', 'lodash.ismatch'],
    rolldownOptions: {
      plugins: [blocksuiteIconTypoPlugin()],
    },
  },
})
