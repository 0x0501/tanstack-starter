import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ]
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center sm:px-8">
      <p className="font-display text-7xl font-semibold text-vermilion dark:text-gold-soft">
        404
      </p>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl dark:text-night-ink">
        This page was not found
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-ink-soft dark:text-night-ink-soft">
        The page you are looking for does not exist or has moved.
      </p>
      <a
        href="/"
        className="mt-8 inline-flex rounded-sm bg-vermilion px-6 py-3 font-semibold text-parchment transition-colors hover:bg-vermilion-deep active:translate-y-px"
      >
        Back to Home
      </a>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static theme-init script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
        {/* <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        /> */}
        <HeadContent />
      </head>
      <body className="bg-parchment text-ink antialiased dark:bg-night dark:text-night-ink">
        <div className="grain-overlay" aria-hidden="true" />
        <div className="flex min-h-[100dvh] flex-col">
          <main className="flex-1">{children}</main>
        </div>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
