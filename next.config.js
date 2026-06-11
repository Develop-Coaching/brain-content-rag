/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  serverExternalPackages: ['@anthropic-ai/sdk', 'openai'],
  webpack: (config) => {
    // The publisher modules use ESM-style ".js" imports (run via tsx);
    // teach webpack to resolve them to the .ts sources.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
