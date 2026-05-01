"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Search, Plus, Mail, Users, MousePointerClick, TrendingUp, Megaphone, Bot } from "lucide-react"
import { api } from "@/lib/api"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalProspects: 0,
    emailsSent: 0,
    openRate: 0,
    leadsGenerated: 0,
    recentActivity: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await api.get('/dashboard/stats');
        setStats({
          totalProspects: data.totalProspects || 0,
          emailsSent: data.emailsSent || 0,
          openRate: data.openRate || 0,
          leadsGenerated: data.leadsGenerated || 0,
          recentActivity: data.recentActivity || [],
        });
      } catch (err) {
        console.error("Failed to fetch stats", err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="flex flex-col gap-8 w-full max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vue d'ensemble</h1>
          <p className="text-muted-foreground mt-1">Voici ce qui se passe avec vos prospects aujourd'hui.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2">
            <Search className="w-4 h-4" />
            Recherche IA
          </Button>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Nouvelle Campagne
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Prospects</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
               <div className="h-8 w-16 bg-muted animate-pulse rounded"></div>
            ) : (
               <div className="text-2xl font-bold">{stats.totalProspects}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Total base de données</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Emails Envoyés</CardTitle>
            <Mail className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
               <div className="h-8 w-16 bg-muted animate-pulse rounded"></div>
            ) : (
               <div className="text-2xl font-bold">{stats.emailsSent}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Par vos campagnes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Taux d'Ouverture</CardTitle>
            <MousePointerClick className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
               <div className="h-8 w-16 bg-muted animate-pulse rounded"></div>
            ) : (
               <div className="text-2xl font-bold">{stats.openRate}%</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Moyenne globale</p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-primary">Leads Générés</CardTitle>
            <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
               <div className="h-8 w-16 bg-primary/20 animate-pulse rounded"></div>
            ) : (
               <div className="text-2xl font-bold text-primary">{stats.leadsGenerated}</div>
            )}
            <p className="text-xs text-primary/80 mt-1">Prospects intéressés</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Placeholder for Chart */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Performance des Campagnes</CardTitle>
            <CardDescription>Évolution des taux d'ouverture et de réponse sur les 30 derniers jours.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center border-t border-dashed bg-muted/20">
            <p className="text-muted-foreground text-sm font-medium flex flex-col items-center gap-2">
              <BarChart className="w-8 h-8 text-muted-foreground/50" />
              Graphique d'Analytics (Recharts) à implémenter
            </p>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Activité Récente</CardTitle>
            <CardDescription>Derniers événements de vos agents.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {loading ? (
                <div className="space-y-4">
                  {[1,2,3].map(i => (
                     <div key={i} className="flex gap-4 items-center">
                        <div className="w-8 h-8 rounded-full bg-muted animate-pulse"></div>
                        <div className="flex-1 space-y-2">
                           <div className="h-4 bg-muted rounded w-3/4 animate-pulse"></div>
                           <div className="h-3 bg-muted/50 rounded w-1/2 animate-pulse"></div>
                        </div>
                     </div>
                  ))}
                </div>
              ) : stats.recentActivity.length > 0 ? (
                stats.recentActivity.map((activity: any, i: number) => (
                  <div key={i} className="flex gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-500`}>
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium leading-none">Agent: {activity.agentName}</span>
                      <span className="text-xs text-muted-foreground">Statut: {activity.status}</span>
                      <span className="text-xs text-muted-foreground/80 mt-1">
                        {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true, locale: fr })}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">Aucune activité récente</div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

function BarChart(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" x2="12" y1="20" y2="10" />
      <line x1="18" x2="18" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="16" />
    </svg>
  )
}
