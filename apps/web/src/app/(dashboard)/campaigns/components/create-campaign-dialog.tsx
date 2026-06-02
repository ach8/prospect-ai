"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus } from "lucide-react"
import { INDUSTRIES } from "@/lib/constants/industries"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/lib/api"

export function CreateCampaignDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState("Création...")
  const [lists, setLists] = useState<any[]>([])
  const [selectedListId, setSelectedListId] = useState<string>("")
  const router = useRouter()

  useEffect(() => {
    if (open) {
      api.get('/lists').then(data => {
        setLists(Array.isArray(data) ? data : [])
      }).catch(console.error)
    }
  }, [open])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setLoadingText("Création...")
    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string
    const targetIndustry = formData.get("targetIndustry") as string
    
    try {
      const payload: any = { name }
      if (selectedListId && selectedListId !== "none") {
        payload.listId = selectedListId
      }
      if (targetIndustry && targetIndustry !== "none") {
        payload.aiConfig = { targetIndustry }
      }
      const newCampaign = await api.post('/campaigns', payload)
      
      if (payload.aiConfig?.targetIndustry) {
        setLoadingText("Nettoyage IA démarré...")
        await api.post(`/campaigns/${newCampaign.id}/start-cleaning`, {})
      }

      setOpen(false)
      onCreated()
      router.push(`/campaigns/${newCampaign.id}/verify`)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setLoadingText("Création...")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" /> Nouvelle Campagne
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Créer une campagne</DialogTitle>
          <DialogDescription>
            Donnez un nom à votre campagne et choisissez une liste de prospects à importer.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom de la campagne</Label>
              <Input id="name" name="name" placeholder="Ex: Prospection Agences Web Q3" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="list">Liste de prospects (Optionnel)</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une liste" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune liste pour le moment</SelectItem>
                  {lists.map(list => (
                    <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetIndustry">Secteur d'activité ciblé (Optionnel)</Label>
              <Select name="targetIndustry" defaultValue="none">
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un secteur cible" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tous secteurs confondus</SelectItem>
                  {INDUSTRIES.map(ind => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si un secteur est défini, l'Agent Nettoyeur activera une "Voie Rapide" et filtrera les prospects hors-cible.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={loading}>{loading ? loadingText : "Suivant"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
