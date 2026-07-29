import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Resolve the Tailwind config by ABSOLUTE path. Vite may run with a process cwd
// that isn't the project root, which breaks Tailwind's default config auto-search
// (it looks in process.cwd()). Pinning the absolute path makes it deterministic.
const here = dirname(fileURLToPath(import.meta.url))

export default {
  plugins: {
    tailwindcss: { config: resolve(here, 'tailwind.config.js') },
    autoprefixer: {},
  },
}
