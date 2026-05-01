"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { CreateCampaignDialog } from "./components/create-campaign-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Play, Pause, Settings, Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])

  const fetchCampaigns = async () => {
    try {
      const data = await api.get('/campaigns')
      setCampaigns(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {campaigns.length === 0 ? (
          <div className="col-span-full py-12 text-center border border-dashed rounded-lg bg-muted/20">
            <Megaphone className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium">Aucune campagne</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-2">
              Vous n'avez pas encore créé de campagne. Cliquez sur le bouton "Nouvelle Campagne" pour commencer.
            </p>
          </div>
        ) : (
          campaigns.map((campaign: any) => (
            <Card key={campaign.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <Badge variant={campaign.status === 'RUNNING' ? 'default' : 'secondary'} className="mb-2">
                    {campaign.status === 'DRAFT' ? 'Brouillon' : campaign.status}
                  </Badge>
                </div>
                <CardTitle className="text-xl">{campaign.name}</CardTitle>
                <CardDescription className="line-clamp-2 mt-1">{campaign.goal}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex justify-between items-center text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                  <div className="flex flex-col items-center">
                    <span className="font-semibold text-foreground">{campaign._count?.prospects || 0}</span>
                    <span className="text-xs">Prospects</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="font-semibold text-foreground">0</span>
                    <span className="text-xs">Envoyés</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="font-semibold text-foreground">0%</span>
                    <span className="text-xs">Rép.</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-3 border-t flex justify-between gap-2">
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <Settings className="w-4 h-4" /> Configurer
                </Button>
                <Button variant="default" size="sm" className="w-full gap-2" disabled={campaign.status === 'RUNNING'}>
                  {campaign.status === 'RUNNING' ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Lancer</>}
                </Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
