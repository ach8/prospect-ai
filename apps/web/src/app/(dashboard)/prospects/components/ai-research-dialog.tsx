"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
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
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Sparkles, Loader2 } from "lucide-react"

export function AiResearchDialog({ onComplete }: { onComplete: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState<{ summary: string; prospects: any[]; listId?: string } | null>(null)
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setResults(null)
    setSelectedIndexes([])
    const formData = new FormData(e.currentTarget)
    const prompt = formData.get("prompt") as string
    const listName = formData.get("listName") as string
    const weblessOnly = formData.get("weblessOnly") === "on"
    
    try {
      const { api } = await import('@/lib/api')
      // Lancement de l'agent avec le nom du dossier optionnel
      const result = await api.post('/agents/research', { prompt, listName, weblessOnly })
      
      setResults({
        summary: result.summary || "",
        prospects: result.prospects || [],
        listId: result.listId
      })
      if (result.prospects && result.prospects.length > 0) {
        setSelectedIndexes(result.prospects.map((_: any, i: number) => i)) // Select all by default
      }
      
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.response?.data?.message || err.message || "Une erreur s'est produite pendant la recherche.";
      setResults({ summary: `[ERREUR TECHNIQUE] L'IA a rencontré un problème :\n\n${errorMsg}`, prospects: [] })
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!results || selectedIndexes.length === 0) return;
    setSaving(true);
    try {
      const { api } = await import('@/lib/api');
      const selected = selectedIndexes.map(i => results.prospects[i]);
      
      await Promise.all(selected.map(p => {
        const VALID_SOURCES = ['GOOGLE_SEARCH', 'GOOGLE_PLACES', 'SCRAPING', 'OPEN_DATA', 'LINKEDIN', 'MANUAL', 'API_IMPORT'];
        const validSource = p.source && VALID_SOURCES.includes(p.source.toUpperCase()) ? p.source.toUpperCase() : 'GOOGLE_SEARCH';

        const payload = {
          ...p,
          firstName: p.firstName || p.first_name || 'Inconnu',
          lastName: p.lastName || p.last_name || 'Inconnu',
          companyName: p.companyName || p.company_name || 'Inconnu',
          jobTitle: p.jobTitle || p.position || p.title || 'Non spécifié',
          companyDomain: p.companyDomain || p.website || 'inconnu.com',
          listId: results.listId,
          source: validSource,
          enrichmentData: { 

             ...(p.enrichmentData || {}),
             companyAddress: p.companyAddress,
             companyDescription: p.companyDescription,
             googleMapsUrl: p.googleMapsUrl
          }
        };
        // Nettoyage des propriétés non autorisées par le backend
        delete payload.position;
        delete payload.website;
        delete payload.emailConfidence;
        delete payload.first_name;
        delete payload.last_name;
        delete payload.company_name;
        delete payload.title;
        delete payload.companyAddress;
        delete payload.companyDescription;
        if (!payload.email) delete payload.email; // Évite l'erreur class-validator si l'email est une chaîne vide
        
        return api.post('/prospects', payload);
      }));
      
      onComplete();
      setOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) setResults(null); }}>
      <DialogTrigger asChild>
        <Button className="gap-2" variant="default">
          <Sparkles className="w-4 h-4" /> Agent de Recherche
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Recherche Intelligente de Prospects
          </DialogTitle>
          <DialogDescription>
            Décrivez votre cible. Notre Agent IA Gemini va parcourir le web, extraire les profils correspondants, vérifier leurs emails via SMTP Ping et les ajouter à votre base de données.
          </DialogDescription>
        </DialogHeader>
        
        {!results ? (
          <form onSubmit={onSubmit}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Votre recherche</label>
                <Textarea 
                  name="prompt" 
                  placeholder="Ex: Trouve 3 dirigeants d'agences web situées à Paris avec leurs adresses email." 
                  required 
                  className="resize-none"
                  rows={4}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  Dossier de destination (optionnel)
                </label>
                <input 
                  type="text" 
                  name="listName" 
                  placeholder="Ex: Agences Web Paris" 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loading}
                />
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox id="weblessOnly" name="weblessOnly" disabled={loading} />
                <label
                  htmlFor="weblessOnly"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Uniquement des entreprises SANS site web (Création de sites)
                </label>
              </div>
            </div>
            {loading && (
              <div className="flex flex-col items-center justify-center p-4 gap-2 text-sm text-muted-foreground">
                 <Loader2 className="h-6 w-6 animate-spin text-primary" />
                 L'agent explore le web, teste les serveurs SMTP... Cela peut prendre 30 à 60 secondes.
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>Annuler</Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Recherche en cours..." : "Lancer la recherche"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            
            {results.summary && (
              <div className="p-3 text-sm bg-muted/30 border rounded-md text-foreground whitespace-pre-wrap">
                <span className="font-semibold text-primary flex items-center gap-2 mb-2">
                  <Sparkles className="w-3 h-3" /> Note de l'Agent IA
                </span>
                {results.summary}
              </div>
            )}

            {results.prospects.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
                 <Button variant="outline" onClick={() => setResults(null)} className="mt-2">Nouvelle recherche</Button>
               </div>
            ) : (
               <div className="space-y-3 mt-4">
                 <h4 className="font-semibold text-sm">Prospects trouvés ({results.prospects.length})</h4>
                 {results.prospects.map((p, index) => (
                   <div key={index} className="flex items-start gap-3 p-3 border rounded-md">
                     <input 
                       type="checkbox" 
                       className="mt-1 w-4 h-4 cursor-pointer"
                       checked={selectedIndexes.includes(index)}
                       onChange={(e) => {
                         if (e.target.checked) setSelectedIndexes([...selectedIndexes, index])
                         else setSelectedIndexes(selectedIndexes.filter(i => i !== index))
                       }}
                     />
                     <div className="flex-1 space-y-1">
                       <div className="flex items-center justify-between">
                         <span className="font-medium text-sm">{p.firstName} {p.lastName}</span>
                         {p.emailVerified ? (
                           <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/10 text-[10px]">Email Vérifié</Badge>
                         ) : p.email ? (
                           <Badge variant="outline" className="text-yellow-500 border-yellow-500/20 bg-yellow-500/10 text-[10px]">Non Vérifié</Badge>
                         ) : (
                           <Badge variant="outline" className="text-muted-foreground text-[10px]">Sans Email</Badge>
                         )}
                       </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <div className="text-xs text-muted-foreground">{p.jobTitle} @ {p.companyName}</div>
                          {p.source && (
                            <Badge variant="outline" className="text-[9px] uppercase">{p.source.replace('_', ' ')}</Badge>
                          )}
                          {p.enrichmentData?.leadScore && (
                            <Badge variant="outline" className="text-[9px] text-blue-500 bg-blue-500/10 border-blue-500/20">
                              Score: {p.enrichmentData.leadScore}/100
                            </Badge>
                          )}
                          {p.googleMapsUrl && (
                            <a href={p.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-1">
                              📍 Google Maps
                            </a>
                          )}
                        </div>
                       {p.email && <div className="text-xs">{p.email}</div>}
                       {p.enrichmentData?.companyDescription && (
                         <div className="text-[10px] text-muted-foreground mt-1 italic border-l-2 pl-2">
                           "{p.enrichmentData.companyDescription}"
                         </div>
                       )}
                     </div>
                   </div>
                 ))}
               </div>
             )}

             <DialogFooter className="mt-6">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
                <Button onClick={handleSave} disabled={saving || selectedIndexes.length === 0}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {saving ? "Sauvegarde..." : `Sauvegarder ${selectedIndexes.length} prospect(s)`}
                </Button>
             </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
