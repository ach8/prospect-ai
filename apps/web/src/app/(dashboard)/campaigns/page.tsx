"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { CreateCampaignDialog } from "./components/create-campaign-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Play, Pause, Settings, Megaphone, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const router = useRouter()

  const fetchCampaigns = async () => {
    try {
      const data = await api.get('/campaigns')
      setCampaigns(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteCampaign = async (id: string) => {
    if (confirm("Voulez-vous vraiment supprimer cette campagne ? Toutes les données associées seront perdues.")) {
      try {
        await api.delete(`/campaigns/${id}`)
        fetchCampaigns()
      } catch (err) {
        console.error(err)
        alert("Erreur lors de la suppression de la campagne")
      }
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  return (
    <div className="flex flex-col gap-8 w-full max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vos Campagnes</h1>
          <p className="text-muted-foreground mt-1">Gérez vos séquences de prospection générées par IA.</p>
        </div>
        <CreateCampaignDialog onCreated={fetchCampaigns} />
      </div>

      <div className="flex flex-col gap-4">
        {campaigns.length === 0 ? (
          <div className="py-16 text-center border border-dashed rounded-xl bg-muted/10">
            <Megaphone className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Aucune campagne</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-2">
              Vous n'avez pas encore créé de campagne. Cliquez sur le bouton "Nouvelle Campagne" pour commencer.
            </p>
          </div>
        ) : (
          campaigns.map((campaign: any) => (
            <div key={campaign.id} className="flex flex-col md:flex-row items-center justify-between gap-6 p-5 bg-card border rounded-xl shadow-sm hover:shadow-md transition-all">
              
              {/* Infos de la campagne */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <Badge variant={campaign.status === 'RUNNING' ? 'default' : 'secondary'} className="px-2 py-0.5 text-[10px] uppercase tracking-wider">
                    {campaign.status === 'DRAFT' ? 'Brouillon' : campaign.status}
                  </Badge>
                </div>
                <h3 className="text-lg font-bold truncate">{campaign.name}</h3>
                {campaign.goal && <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{campaign.goal}</p>}
              </div>

              {/* Métriques */}
              <div className="flex items-center gap-8 px-6 py-2 bg-muted/20 rounded-lg">
                <div className="flex flex-col items-center">
                  <span className="text-lg font-bold text-foreground">{campaign._count?.prospects || 0}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Prospects</span>
                </div>
                <div className="w-px h-8 bg-border"></div>
                <div className="flex flex-col items-center">
                  <span className="text-lg font-bold text-foreground">0</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Envoyés</span>
                </div>
                <div className="w-px h-8 bg-border"></div>
                <div className="flex flex-col items-center">
                  <span className="text-lg font-bold text-foreground">0%</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Rép.</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 w-full md:w-auto">
                <Button variant="outline" size="sm" className="flex-1 md:flex-none gap-2" onClick={() => router.push(`/campaigns/${campaign.id}/verify`)}>
                  <Settings className="w-4 h-4" /> Configurer
                </Button>
                <Button 
                  variant={campaign.status === 'RUNNING' ? "secondary" : "default"} 
                  size="sm" 
                  className="flex-1 md:flex-none gap-2" 
                  disabled={campaign.status === 'RUNNING'}
                >
                  {campaign.status === 'RUNNING' ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Lancer</>}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground hover:text-red-500" 
                  onClick={() => handleDeleteCampaign(campaign.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
