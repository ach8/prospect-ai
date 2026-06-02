"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Loader2, Play, Download, Search, RefreshCw, Eye, ListPlus, Sparkles } from "lucide-react"
import { AddToListDialog } from "@/app/(dashboard)/prospects/components/add-to-list-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function ExpertAgentPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  const [prompt, setPrompt] = useState("")
  const [targetCount, setTargetCount] = useState(50)

  const [viewJobId, setViewJobId] = useState<string | null>(null)
  const [jobProspects, setJobProspects] = useState<any[]>([])
  const [loadingProspects, setLoadingProspects] = useState(false)
  const [showAddToList, setShowAddToList] = useState(false)

  const [lists, setLists] = useState<any[]>([])
  const [selectedListId, setSelectedListId] = useState<string>("none")
  const [excludeListIds, setExcludeListIds] = useState<string[]>([])

  const fetchJobs = async () => {
    try {
      const res = await api.get('/agents/deep-research/jobs')
      setJobs(res.jobs || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchLists = async () => {
    try {
      const data = await api.get('/lists')
      setLists(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchJobs()
    fetchLists()
    const interval = setInterval(fetchJobs, 10000) // refresh every 10s
    return () => clearInterval(interval)
  }, [])

  const handleStartExpert = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt) return
    setStarting(true)
    try {
      await api.post('/agents/deep-research/async', {
        prompt,
        targetCount: Number(targetCount),
        listId: selectedListId === "none" ? undefined : selectedListId,
        excludeListIds: excludeListIds.length > 0 ? excludeListIds : undefined
      })
      setPrompt("")
      setExcludeListIds([])
      fetchJobs()
    } catch (err) {
      console.error(err)
      alert("Erreur lors du lancement de la tâche experte.")
    } finally {
      setStarting(false)
    }
  }

  const handleExport = async (jobId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/agents/research/${jobId}/export`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error("Erreur lors de l'export");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prospects_expert_${jobId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("Impossible de télécharger le CSV.");
    }
  }

  const handleViewResults = async (jobId: string) => {
    setViewJobId(jobId)
    setLoadingProspects(true)
    try {
      const res = await api.get(`/agents/research/${jobId}/prospects`)
      setJobProspects(res.prospects || [])
    } catch (err) {
      console.error(err)
      alert("Impossible de charger les résultats.")
    } finally {
      setLoadingProspects(false)
    }
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-primary" />
          Agent Expert (Deep Research)
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Nouvelle Tâche Experte</CardTitle>
            <CardDescription>
              Idéal pour les requêtes complexes. L'IA visite les sites web pour valider strictement vos critères.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleStartExpert} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Recherche Complexe</label>
                <Textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ex: Startups IA à Paris qui ont levé des fonds récemment, avec un dirigeant joignable." 
                  required 
                  disabled={starting}
                  rows={5}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Objectif (Nombre max)</label>
                <Input 
                  type="number" 
                  min="5" 
                  max="500" 
                  value={targetCount}
                  onChange={(e) => setTargetCount(e.target.value as any)}
                  required 
                  disabled={starting}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Liste de destination</label>
                <Select value={selectedListId} onValueChange={setSelectedListId} disabled={starting}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder="Sélectionnez une liste" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Base de données générale (sans liste)</SelectItem>
                    {lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Listes à exclure (Dédoublonnage Coût Zéro)</label>
                <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-2 bg-background">
                  {lists.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucune liste disponible.</p>
                  ) : (
                    lists.map(list => (
                      <div key={list.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`exclude-${list.id}`}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                          checked={excludeListIds.includes(list.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExcludeListIds([...excludeListIds, list.id])
                            } else {
                              setExcludeListIds(excludeListIds.filter(id => id !== list.id))
                            }
                          }}
                          disabled={starting}
                        />
                        <label htmlFor={`exclude-${list.id}`} className="text-sm cursor-pointer line-clamp-1 flex-1">
                          {list.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Les prospects appartenant à ces listes seront ignorés avant l'analyse experte.
                </p>
              </div>

              <Button type="submit" className="w-full mt-4" disabled={starting || !prompt}>
                {starting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Lancer la Recherche Profonde
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-0.5">
              <CardTitle>Vos Analyses Expertes</CardTitle>
              <CardDescription>
                Les résultats validés s'affichent ici après le scraping individuel de chaque entreprise.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border border-dashed rounded-lg">
                <Search className="w-8 h-8 mb-2 opacity-50" />
                <p>Aucune recherche experte n'a été lancée.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div key={job.id} className="flex flex-col gap-2 p-4 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-sm line-clamp-2" title={job.prompt}>{job.prompt}</h4>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(job.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant={job.status === 'COMPLETED' ? 'default' : job.status === 'FAILED' ? 'destructive' : 'secondary'}>
                        {job.status === 'PROCESSING' && <Loader2 className="w-3 h-3 mr-1 inline animate-spin" />}
                        {job.status}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex flex-col">
                          <span className="text-muted-foreground text-xs">Cibles trouvées / Objectif</span>
                          <span className="font-medium">{job.foundCount} / {job.targetCount}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-muted-foreground text-xs">Enrichis & Validés</span>
                          <span className="font-medium text-primary">
                            {job.processedCount}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {job.processedCount > 0 && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleViewResults(job.id)}>
                              <Eye className="w-4 h-4 mr-2" />
                              Résultats
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleExport(job.id)}>
                              <Download className="w-4 h-4 mr-2" />
                              CSV
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {job.status === 'PROCESSING' && (
                      <div className="w-full bg-secondary h-1.5 rounded-full mt-2 overflow-hidden">
                        <div 
                          className="bg-primary h-full transition-all duration-500 ease-in-out" 
                          style={{ width: `${Math.min(100, Math.max(5, (job.processedCount / job.foundCount || 0) * 100))}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!viewJobId} onOpenChange={(open) => !open && setViewJobId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Résultats Validés</DialogTitle>
            <DialogDescription>
              {jobProspects.length} prospects validés par l'Agent Expert.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddToList(true)} disabled={jobProspects.length === 0}>
              <ListPlus className="w-4 h-4 mr-2" />
              Ajouter toute la liste
            </Button>
          </div>

          <div className="space-y-3 mt-4">
            {loadingProspects ? (
              <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : jobProspects.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">Aucun résultat validé pour le moment.</div>
            ) : (
              jobProspects.map((p, i) => (
                <div key={i} className="flex flex-col gap-1 p-3 border rounded-md text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.firstName} {p.lastName} <span className="text-muted-foreground font-normal">@ {p.companyName}</span></span>
                    <Badge variant="outline" className="text-[10px] text-emerald-500 bg-emerald-500/10 border-emerald-500/20">
                      Vérifié Expert
                    </Badge>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-3 mt-1">
                    {p.email && <span className="text-foreground">{p.email}</span>}
                    {p.linkedinUrl && (
                      <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        LinkedIn
                      </a>
                    )}
                  </div>
                  {p.enrichmentData?.expertReason && (
                    <div className="mt-2 text-xs italic border-l-2 pl-2 text-muted-foreground">
                      "{p.enrichmentData.expertReason}"
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddToListDialog
        isOpen={showAddToList}
        onClose={() => setShowAddToList(false)}
        selectedIds={jobProspects.map(p => p.id)}
        onSuccess={() => {
          setShowAddToList(false)
          setViewJobId(null)
          alert("Prospects ajoutés à la liste avec succès !")
        }}
      />
    </div>
  )
}
