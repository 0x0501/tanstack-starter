import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/oauth/consent')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/oauth/consent"!</div>
}
