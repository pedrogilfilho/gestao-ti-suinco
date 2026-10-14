import type { NextConfig } from 'next';
import { join } from 'node:path';

const api = process.env.API_INTERNA ?? 'http://localhost:3001';

const config: NextConfig = {
  output: 'standalone',
  // monorepo: o standalone precisa enxergar packages/shared
  outputFileTracingRoot: join(__dirname, '../../'),
  // o Socket.IO usa "/socket.io/?..." com a barra no fim; sem isto o Next redireciona para "/socket.io" e a API responde 404
  skipTrailingSlashRedirect: true,
  // Em desenvolvimento o Next repassa /api e /socket.io para o Nest (mesmo endereço, o cookie do login vale).
  // Em produção quem faz isso é o Caddy, na frente dos dois.
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    return [
      { source: '/api/:caminho*', destination: `${api}/api/:caminho*` },
      { source: '/socket.io', destination: `${api}/socket.io/` },
      { source: '/socket.io/:caminho+', destination: `${api}/socket.io/:caminho+` },
    ];
  },
};

export default config;
