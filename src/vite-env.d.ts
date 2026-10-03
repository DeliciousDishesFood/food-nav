/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 生产环境的 Cloudflare Worker 代理地址，例如 https://food-nav-quote.<account>.workers.dev */
  readonly VITE_QUOTE_PROXY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
