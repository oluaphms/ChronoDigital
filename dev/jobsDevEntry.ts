/**
 * Entrada estável para o dev server (Vite) importar o handler de jobs
 * sem manter arquivo auxiliar dentro de `api/` (conta como função no Vercel).
 */
export { default } from '../api/jobs/[[...slug]].ts';
