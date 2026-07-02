/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mammoth', 'pdf2json', 'pdf-parse', 'postgres', '@prisma/client', '.prisma']
};

module.exports = nextConfig;
