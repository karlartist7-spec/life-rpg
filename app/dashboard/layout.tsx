import { TopNav } from '@/components/top-nav'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-cream">
      <TopNav />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
