import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * En Vercel, el plugin inyecta `outputFileTracingRoot`. Si además definimos
 * `turbopack.root` con otro valor, Next.js muestra el warning de conflicto.
 * Solo usamos turbopack.root en desarrollo local.
 */
const nextConfig: NextConfig = process.env.VERCEL
  ? {}
  : {
      turbopack: {
        root: configDir,
      },
    };

export default nextConfig;
