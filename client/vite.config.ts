import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sharedRoot = fileURLToPath(new URL('../shared/src', import.meta.url));

export default defineConfig({
  root: clientRoot,
  // 仓库根目录的 assets/ 直接作为静态目录：/images/xxx.png、/audio/xxx.ogg
  // 好处是改素材不用碰 client/，构建时也会原样复制进 dist/
  publicDir: fileURLToPath(new URL('../assets', import.meta.url)),
  resolve: {
    alias: {
      '@shared': sharedRoot,
    },
  },
  server: {
    port: 5173,
    // 允许读取仓库根目录下的 shared/（纯 TS 逻辑层，客户端与服务端共用）
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true,
  },
});
