"use client"

import { useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function CreateCampaignDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tone, setTone] = useState("Professionnel et direct")

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string
    const goal = formData.get("goal") as string
    
    try {
      const { api } = await import('@/lib/api')
      await api.post('/campaigns', { name, goal, tone })
      setOpen(false)
      onCreated()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
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
            Configurez l'objectif de votre campagne. L'IA s'en servira pour rédiger vos emails.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom de la campagne</Label>
              <Input id="name" name="name" placeholder="Ex: Prospection Agences Web Q3" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal">Objectif principal</Label>
              <Textarea 
                id="goal" 
                name="goal" 
                placeholder="Ex: Proposer notre outil de SEO et obtenir un appel de 15 minutes." 
                required 
                className="resize-none"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tone">Ton de communication</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un ton" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Professionnel et direct">Professionnel et direct</SelectItem>
                  <SelectItem value="Amical et décontracté">Amical et décontracté</SelectItem>
                  <SelectItem value="Humoristique">Humoristique</SelectItem>
                  <SelectItem value="Provocateur (Challenger Sale)">Provocateur (Challenger Sale)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={loading}>{loading ? "Création..." : "Créer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
