import { useEffect, useState } from 'react'
import { Users, Database, FileText, Activity } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { adminApi } from '@/api/admin'
import type { AdminStats } from '@/types'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.getStats().then((res) => {
      setStats(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const cards = stats ? [
    { label: '总用户数', value: stats.total_users, icon: Users, color: 'text-blue-600' },
    { label: '活跃用户', value: stats.active_users, icon: Activity, color: 'text-green-600' },
    { label: '知识库总数', value: stats.total_knowledge_bases, icon: Database, color: 'text-purple-600' },
    { label: '文档总数', value: stats.total_documents, icon: FileText, color: 'text-orange-600' },
  ] : []

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">系统总览</h1>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-3 w-20 mb-3" />
                <Skeleton className="h-10 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((card) => (
            <Card key={card.label} className="hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-6 relative overflow-hidden">
                <card.icon className={`absolute right-4 top-4 h-16 w-16 ${card.color} opacity-[0.07]`} />
                <div className="relative">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">{card.label}</p>
                  <p className="text-4xl font-bold text-gray-900">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
