import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { LazyMotion, domAnimation } from 'motion/react'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './features/auth/AuthContext'
import { ToastProvider } from './components/feedback/ToastContext'
import './index.css'

/**
 * `m` + LazyMotion(domAnimation) instead of the full `motion` component.
 *
 * `motion.div` bundles every feature — layout projection, drag, scroll — and
 * measured +47kB gzipped on the entry chunk, undoing the route-splitting work.
 * `m` is a featureless stub and `domAnimation` supplies only animation, exit
 * and hover/tap, so the rest tree-shakes out.
 *
 * Loading features via a dynamic import was worse still: `LazyMotion` itself
 * has to be imported statically from the same module, so Vite duplicated it
 * rather than splitting (164kB gzipped). Static import, tree-shaken, wins.
 *
 * `strict` makes `motion.div` throw, so a stray import can't quietly pull the
 * full feature set back in.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LazyMotion features={domAnimation} strict>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </LazyMotion>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
