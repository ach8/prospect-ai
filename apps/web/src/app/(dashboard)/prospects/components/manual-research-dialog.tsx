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

import { Loader2, Hammer, MapPin, Search, Database } from "lucide-react"

const TOOLS = [
  { id: "GOOGLE_PLACES", label: "Google Maps", icon: <MapPin className="w-4 h-4" />, desc: "Cherche des établissements locaux" },
  { id: "WEB_SEARCH", label: "Recherche Web (IA)", icon: <Search className="w-4 h-4" />, desc: "Interroge Google via Gemini" },
  { id: "ENRICHER", label: "Enquête Dirigeants (Sirene)", icon: <Database className="w-4 h-4" />, desc: "Recherche dans la base Sirene" },
]

import { DialogClose } from "@/components/ui/dialog"

export function ManualResearchDialog({ onComplete }: { onComplete: () => void }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState("")
  const [listName, setListName] = useState("")
  const [selectedTools, setSelectedTools] = useState<string[]>(["GOOGLE_PLACES", "WEB_SEARCH"])
  const [results, setResults] = useState<any>(null)
  const [selectedGooglePlaces, setSelectedGooglePlaces] = useState<number[]>([])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (selectedTools.length === 0) return alert("Veuillez sélectionner au moins un outil.")
    
    setLoading(true)
    setResults(null)
    setSelectedGooglePlaces([])
    
    try {
      const { api } = await import('@/lib/api')
      const response = await api.post('/agents/manual', { query, tools: selectedTools })
      setResults(response.results)
      
      if (response.results.googlePlaces && response.results.googlePlaces.length > 0) {
        setSelectedGooglePlaces(response.results.googlePlaces.map((_: any, i: number) => i))
      }
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.response?.data?.message || err.message || "Une erreur s'est produite."
      setResults({ error: errorMsg })
    } finally {
      setLoading(false)
    }
  }

  const toggleTool = (toolId: string) => {
    setSelectedTools(prev => 
      prev.includes(toolId) ? prev.filter(id => id !== toolId) : [...prev, toolId]
    )
  }

  async function handleSave() {
    if (!results?.googlePlaces || selectedGooglePlaces.length === 0) return
    setSaving(true)
    try {
      const { api } = await import('@/lib/api')
      const selected = selectedGooglePlaces.map(i => results.googlePlaces[i])
      
      await Promise.all(selected.map(place => {
        const payload = {
          firstName: 'Inconnu',
          lastName: 'Inconnu',
          companyName: place.name || 'Inconnu',
          jobTitle: 'Non spécifié',
          companyDomain: place.website || 'inconnu.com',
          listId: listName || undefined,
          source: 'GOOGLE_PLACES',
          enrichmentData: {
            companyAddress: place.address,
            phone: place.phone,
            rating: place.rating,
            placeId: place.placeId
          }
        }
        return api.post('/prospects', payload)
      }))
      
      onComplete()
      alert(`${selected.length} prospect(s) ajouté(s) avec succès !`)
    } catch (err) {
      console.error(err)
      alert("Erreur lors de la sauvegarde.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog onOpenChange={(val) => { if (!val) setResults(null); }}>
      <DialogTrigger asChild>
        <Button className="gap-2" variant="outline">
          <Hammer className="w-4 h-4" /> Mode Manuel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer className="w-5 h-5 text-primary" />
            Recherche Manuelle Multi-Outils
          </DialogTitle>
          <DialogDescription>
            Exécutez une requête ciblée sur les outils de votre choix et analysez les résultats bruts.
          </DialogDescription>
        </DialogHeader>
        
        {!results ? (
          <form onSubmit={onSubmit}>
            <div className="grid gap-6 py-4">
              <div className="space-y-3">
                <label className="text-sm font-medium">Votre requête</label>
                <Input 
                  placeholder="Ex: Agences Web à Lyon, ou Nom d'une entreprise exacte" 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  required 
                  disabled={loading}
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  Dossier de destination (optionnel)
                </label>
                <Input 
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder="Ex: Agences Web Paris" 
                  disabled={loading}
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium">Outils à interroger</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {TOOLS.map((tool) => (
                    <div 
                      key={tool.id} 
                      className={`flex items-start space-x-3 p-3 border rounded-md cursor-pointer transition-colors ${selectedTools.includes(tool.id) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      onClick={() => !loading && toggleTool(tool.id)}
                    >
                      <input 
                        type="checkbox"
                        className="mt-1 w-4 h-4 cursor-pointer"
                        checked={selectedTools.includes(tool.id)}
                        onChange={() => !loading && toggleTool(tool.id)}
                        id={tool.id}
                        disabled={loading}
                      />
                      <div className="space-y-1 leading-none flex-1">
                        <label htmlFor={tool.id} className="text-sm font-medium leading-none flex items-center gap-2 cursor-pointer">
                          {tool.icon} {tool.label}
                        </label>
                        <p className="text-xs text-muted-foreground">{tool.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
                 <Loader2 className="h-4 w-4 animate-spin text-primary" />
                 Exécution des outils en parallèle...
              </div>
            )}
            
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={loading}>Fermer</Button>
              </DialogClose>
              <Button type="submit" disabled={loading || selectedTools.length === 0 || !query}>
                Lancer les outils
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-6 py-4 max-h-[70vh] overflow-y-auto pr-2">
            {results.error && (
              <div className="p-3 text-sm bg-red-500/10 border-red-500/20 text-red-500 rounded-md">
                <strong>Erreur globale :</strong> {results.error}
              </div>
            )}

            {results.googlePlaces && (
              <div className="space-y-2">
                <h3 className="font-semibold flex items-center gap-2 text-primary border-b pb-1">
                  <MapPin className="w-4 h-4" /> Résultats Google Maps
                </h3>
                {Array.isArray(results.googlePlaces) && results.googlePlaces.length > 0 ? (
                  <div className="grid gap-2">
                    {results.googlePlaces.map((place: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-3 border rounded-md">
                        <input 
                          type="checkbox" 
                          className="mt-1 w-4 h-4 cursor-pointer"
                          checked={selectedGooglePlaces.includes(i)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedGooglePlaces([...selectedGooglePlaces, i])
                            else setSelectedGooglePlaces(selectedGooglePlaces.filter(idx => idx !== i))
                          }}
                        />
                        <div className="flex-1 space-y-1 text-sm">
                          <div className="font-medium flex justify-between items-center">
                            {place.name}
                            {place.rating && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">⭐ {place.rating}</span>}
                          </div>
                          <div className="text-muted-foreground text-xs">{place.address}</div>
                          {place.phone && <div className="text-xs">{place.phone}</div>}
                          {place.website && <a href={place.website} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">{place.website}</a>}
                        </div>
                      </div>
                    ))}
                    
                    {selectedGooglePlaces.length > 0 && (
                      <Button onClick={handleSave} disabled={saving} className="mt-2 w-full">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                        {saving ? "Sauvegarde..." : `Sauvegarder ${selectedGooglePlaces.length} prospect(s) de Google Maps`}
                      </Button>
                    )}
                  </div>
                ) : (
                   <p className="text-sm text-muted-foreground italic">Aucun résultat Google Maps.</p>
                )}
              </div>
            )}

            {results.webSearch && (
              <div className="space-y-2 mt-6">
                <h3 className="font-semibold flex items-center gap-2 text-primary border-b pb-1">
                  <Search className="w-4 h-4" /> Résultats Recherche Web
                </h3>
                <div className="p-3 bg-muted/30 border rounded-md text-sm whitespace-pre-wrap">
                  {results.webSearch}
                </div>
              </div>
            )}

            {results.enricher && (
              <div className="space-y-2 mt-6">
                <h3 className="font-semibold flex items-center gap-2 text-primary border-b pb-1">
                  <Database className="w-4 h-4" /> Résultats Sirene / Enrichissement
                </h3>
                <div className="p-3 bg-muted/30 border rounded-md text-sm whitespace-pre-wrap">
                  {typeof results.enricher === 'object' ? JSON.stringify(results.enricher, null, 2) : results.enricher}
                </div>
              </div>
            )}

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => setResults(null)}>Nouvelle recherche manuelle</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
