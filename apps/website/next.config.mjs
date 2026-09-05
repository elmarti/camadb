/** @type {import('next').NextConfig} */
const config = {
  agentRules: false,
  basePath: process.env.CAMADB_BASE_PATH || '',
  output: 'export',
  trailingSlash: true,
  transpilePackages: ['@camadb/design'],
};

export default config;
