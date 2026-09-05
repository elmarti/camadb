import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: ({ browser }) => ({
    name: 'Cama Studio',
    description: 'Inspect CamaDB databases, collections, records, storage health and retrieval results locally.',
    permissions: browser === 'safari' ? ['devtools'] : [],
    browser_specific_settings:
      browser === 'firefox'
        ? {
            gecko: {
              id: 'studio@camadb.dev',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          }
        : undefined,
  }),
});
