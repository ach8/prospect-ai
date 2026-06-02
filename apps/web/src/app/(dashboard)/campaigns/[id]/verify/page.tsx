"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { ArrowLeft, CheckCircle2, AlertCircle, Wand2, Trash2, Info } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

export default function CampaignVerifyPage() {
  const { id } = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const keptCount = searchParams.get('kept')
  const rejectedCount = searchParams.get('rejected')

  const [campaign, setCampaign] = useState<any>(null)
  const [prospects, setProspects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cleaningStatus, setCleaningStatus] = useState<{ isCleaning: boolean, kept?: number, rejected?: number }>({ isCleaning: false })
  
  // Nouveaux états pour l'enrichissement
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isEnrichModalOpen, setIsEnrichModalOpen] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichOptions, setEnrichOptions] = useState({
    findEmail: true,
    findPhone: false,
    findLinkedin: false,
  })

  const fetchCampaignData = async () => {
    try {
      const [campaignData, prospectsData] = await Promise.all([
        api.get(`/campaigns/${id}`),
        api.get(`/campaigns/${id}/prospects`)
      ])
      setCampaign(campaignData)
      setProspects(prospectsData.map((p: any) => p.prospect))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCampaignData()
  }, [id])

  useEffect(() => {
    // Poll for cleaning status
    const checkStatus = async () => {
      try {
        const res = await api.get(`/campaigns/${id}/cleaning-status`)
        if (res.isCleaning) {
          setCleaningStatus({ isCleaning: true })
          fetchCampaignData() // Refresh prospects as they get deleted
        } else if (res.status === 'COMPLETED' && cleaningStatus.isCleaning) {
          // Just finished!
          setCleaningStatus({ 
            isCleaning: false, 
            kept: res.result?.kept, 
            rejected: res.result?.rejected 
          })
          fetchCampaignData()
        } else if (res.status === 'COMPLETED') {
          setCleaningStatus({ 
            isCleaning: false, 
            kept: res.result?.kept, 
            rejected: res.result?.rejected 
          })
        } else {
          setCleaningStatus({ isCleaning: false })
        }
      } catch (err) {
        console.error(err)
      }
    }

    checkStatus()
    const interval = setInterval(() => {
      if (cleaningStatus.isCleaning || loading) {
        checkStatus()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [id, cleaningStatus.isCleaning, loading])

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Chargement de la vérification...</div>
  }

  const getMissingFields = (prospect: any) => {
    const missing = []
    if (!prospect.firstName) missing.push("Prénom")
    if (!prospect.lastName) missing.push("Nom")
    if (!prospect.email) missing.push("Email")
    if (!prospect.companyName) missing.push("Entreprise")
    if (!prospect.industry) missing.push("Secteur")
    return missing
  }

  const prospectsWithMissing = prospects.filter(p => getMissingFields(p).length > 0)
  const isReady = prospectsWithMissing.length === 0 && prospects.length > 0

  const handleSelectAllMissingEmails = () => {
    const missingEmails = prospects.filter(p => !p.email).map(p => p.id)
    setSelectedIds(missingEmails)
  }

  const toggleSelection = (prospectId: string) => {
    setSelectedIds(prev => 
      prev.includes(prospectId) ? prev.filter(pid => pid !== prospectId) : [...prev, prospectId]
    )
  }

  const handleRemoveProspect = async (prospectId: string) => {
    if (!confirm("Voulez-vous vraiment retirer ce prospect de la campagne ?")) return;
    
    try {
      await api.delete(`/campaigns/${id}/prospects/${prospectId}`)
      setProspects(prev => prev.filter(p => p.id !== prospectId))
      setSelectedIds(prev => prev.filter(pid => pid !== prospectId))
    } catch (err) {
      console.error(err)
      alert("Erreur lors du retrait")
    }
  }

  const handleBulkRemove = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Voulez-vous vraiment retirer ces ${selectedIds.length} prospects de la campagne ?`)) return;
    
    try {
      await api.delete(`/campaigns/${id}/prospects`, {
        body: JSON.stringify({ prospectIds: selectedIds }),
        headers: { 'Content-Type': 'application/json' }
      });
      setProspects(prev => prev.filter(p => !selectedIds.includes(p.id)));
      setSelectedIds([]);
    } catch (err) {
      console.error("Erreur lors de la suppression en masse:", err);
      alert("Erreur lors du retrait");
    }
  }

  const startEnrichment = async () => {
    if (selectedIds.length === 0) return
    setEnriching(true)
    try {
      const response = await api.post('/enrichment/existing', {
        prospectIds: selectedIds,
        options: enrichOptions
      })
      // Rediriger vers la page d'enrichissement globale avec le jobId pour suivre la progression
      router.push(`/enrichment?jobId=${response.jobId}`)
    } catch (err) {
      console.error("Erreur lors de l'enrichissement:", err)
      setEnriching(false)
    }
  }

  const handleContinue = async () => {
    const missingEmails = prospects.filter(p => !p.email).map(p => p.id);
    if (missingEmails.length > 0) {
      if (confirm(`Attention, ${missingEmails.length} prospects n'ont pas d'email. Ils vont être retirés de la campagne pour ne pas gaspiller de crédits IA. Confirmer ?`)) {
        try {
          await api.delete(`/campaigns/${id}/prospects`, {
            body: JSON.stringify({ prospectIds: missingEmails }),
            headers: { 'Content-Type': 'application/json' }
          });
          router.push(`/campaigns/${id}/sequence`);
        } catch (err) {
          console.error("Erreur lors de la suppression:", err);
          alert("Erreur lors de la suppression des prospects sans email.");
        }
      }
    } else {
      router.push(`/campaigns/${id}/sequence`);
    }
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-[1200px] mx-auto animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/campaigns')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vérification des données</h1>
          <p className="text-muted-foreground mt-1">
            Campagne : <span className="font-semibold text-foreground">{campaign?.name}</span>
          </p>
        </div>
      </div>

      {cleaningStatus.isCleaning && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 flex gap-3 text-sm text-yellow-600 animate-pulse">
          <Wand2 className="h-5 w-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <h5 className="font-semibold leading-none tracking-tight">Nettoyage IA en cours...</h5>
            <div className="opacity-90">
              L'Agent Nettoyeur vérifie chaque prospect pour s'assurer qu'il correspond bien au secteur cible. Les prospects hors-cible disparaîtront automatiquement de la liste.
            </div>
          </div>
        </div>
      )}

      {(!cleaningStatus.isCleaning && cleaningStatus.kept !== undefined && cleaningStatus.rejected !== undefined) && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3 text-sm text-primary">
          <Info className="h-5 w-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <h5 className="font-semibold leading-none tracking-tight">Nettoyage IA terminé</h5>
            <div className="opacity-90">
              <strong>{cleaningStatus.kept}</strong> prospects correspondent à votre cible. <strong>{cleaningStatus.rejected}</strong> prospects ont été retirés car ils n'étaient pas dans le bon secteur. Vous pouvez retrouver les prospects rejetés et leur nouveau secteur dans la liste "Prospects Rejetés".
            </div>
          </div>
        </div>
      )}

      {keptCount !== null && rejectedCount !== null && cleaningStatus.kept === undefined && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3 text-sm text-primary">
          <Info className="h-5 w-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <h5 className="font-semibold leading-none tracking-tight">Nettoyage IA terminé</h5>
            <div className="opacity-90">
              <strong>{keptCount}</strong> prospects correspondent à votre cible. <strong>{rejectedCount}</strong> prospects ont été retirés car ils n'étaient pas dans le bon secteur. Vous pouvez retrouver les prospects rejetés et leur nouveau secteur dans la liste "Prospects Rejetés".
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-card rounded-xl border p-6 flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Qualité des prospects
                {isReady ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Prêt pour l'IA</Badge>
                ) : (
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Données manquantes</Badge>
                )}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                L'Intelligence Artificielle génère des emails ultra-personnalisés. Assurez-vous que tous les champs importants sont remplis.
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAllMissingEmails}>
                Sélectionner emails manquants
              </Button>
              {selectedIds.length > 0 && (
                <>
                  <Button variant="destructive" size="sm" onClick={handleBulkRemove} className="gap-2">
                    <Trash2 className="w-4 h-4" /> Retirer ({selectedIds.length})
                  </Button>
                  <Button size="sm" onClick={() => setIsEnrichModalOpen(true)} className="gap-2">
                    <Wand2 className="w-4 h-4" /> Enrichir ({selectedIds.length})
                  </Button>
                </>
              )}
            </div>
          </div>
          
          <div className="mt-4 rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Entreprise</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Aucun prospect dans cette campagne.
                    </TableCell>
                  </TableRow>
                ) : (
                  prospects.map((prospect) => {
                    const missing = getMissingFields(prospect)
                    return (
                      <TableRow key={prospect.id}>
                        <TableCell>
                          <Checkbox 
                            checked={selectedIds.includes(prospect.id)}
                            onCheckedChange={() => toggleSelection(prospect.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {prospect.firstName || prospect.lastName 
                            ? `${prospect.firstName || ''} ${prospect.lastName || ''}`.trim() 
                            : <span className="text-red-500 italic">Nom manquant</span>}
                        </TableCell>
                        <TableCell>
                          {prospect.email ? prospect.email : <span className="text-red-500 italic">Email manquant</span>}
                        </TableCell>
                        <TableCell>
                          {prospect.companyName ? prospect.companyName : <span className="text-red-500 italic">Entreprise manquante</span>}
                        </TableCell>
                        <TableCell>
                          {missing.length === 0 ? (
                            <div className="flex items-center gap-1.5 text-emerald-500 text-sm">
                              <CheckCircle2 className="w-4 h-4" /> Complet
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 text-red-500 text-sm font-medium">
                                <AlertCircle className="w-4 h-4" /> Il manque :
                              </div>
                              <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
                                {missing.map(m => (
                                  <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500" onClick={() => handleRemoveProspect(prospect.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-primary/5 rounded-xl border border-primary/10 p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-primary">Prochaine étape</h3>
            <p className="text-sm text-muted-foreground">
              Si des données sont manquantes, vous pouvez utiliser l'outil d'enrichissement pour trouver les emails ou les LinkedIn manquants en un clic.
            </p>
            <div className="pt-4 flex flex-col gap-3">
              <Button onClick={handleContinue} className="w-full" disabled={cleaningStatus.isCleaning}>
                {cleaningStatus.isCleaning ? "Veuillez patienter..." : "Continuer vers les séquences"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isEnrichModalOpen} onOpenChange={setIsEnrichModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enrichir {selectedIds.length} prospects</DialogTitle>
            <DialogDescription>
              Choisissez les informations que l'Intelligence Artificielle doit rechercher.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="findEmail" 
                checked={enrichOptions.findEmail} 
                onCheckedChange={(c) => setEnrichOptions({...enrichOptions, findEmail: !!c})}
              />
              <Label htmlFor="findEmail">Trouver les emails B2B vérifiés (Recommandé)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="findLinkedin" 
                checked={enrichOptions.findLinkedin} 
                onCheckedChange={(c) => setEnrichOptions({...enrichOptions, findLinkedin: !!c})}
              />
              <Label htmlFor="findLinkedin">Trouver les profils LinkedIn</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="findPhone" 
                checked={enrichOptions.findPhone} 
                onCheckedChange={(c) => setEnrichOptions({...enrichOptions, findPhone: !!c})}
              />
              <Label htmlFor="findPhone">Trouver les numéros de téléphone (Google Places)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEnrichModalOpen(false)}>Annuler</Button>
            <Button onClick={startEnrichment} disabled={enriching}>
              {enriching ? "Lancement..." : "Lancer l'enrichissement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
