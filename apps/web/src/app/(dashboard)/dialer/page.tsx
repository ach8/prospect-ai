"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Loader2, PhoneForwarded, Voicemail, PhoneMissed, ThumbsUp, ThumbsDown, FastForward, CheckCircle2, ChevronRight, User, Building2, Clock, Calendar, ShieldCheck, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const CALL_STATUSES = {
  UNCALLED: { label: "Non appelé", color: "bg-muted text-muted-foreground" },
  SKIPPED: { label: "Passé", color: "bg-muted text-muted-foreground" },
  VOICEMAIL: { label: "Répondeur", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500/20" },
  CALL_BACK: { label: "À rappeler", color: "bg-blue-500/10 text-blue-600 dark:text-blue-500 border-blue-500/20" },
  NOT_INTERESTED: { label: "Pas intéressé", color: "bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/20" },
  INTERESTED: { label: "Intéressé", color: "bg-green-500/10 text-green-600 dark:text-green-500 border-green-500/20" },
  WRONG_NUMBER: { label: "Faux numéro", color: "bg-orange-500/10 text-orange-600 dark:text-orange-500 border-orange-500/20" },
}

type FilterMode = 'new' | 'retry' | 'all';

export default function DialerPage() {
  const [lists, setLists] = useState<any[]>([])
  const [selectedListId, setSelectedListId] = useState<string>("")
  
  const [allProspects, setAllProspects] = useState<any[]>([])
  const [prospects, setProspects] = useState<any[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  
  const [filterMode, setFilterMode] = useState<FilterMode>('new')

  const [notes, setNotes] = useState("")
  const [savingStatus, setSavingStatus] = useState<string | null>(null)

  // Modal Intéressé
  const [showInterestedModal, setShowInterestedModal] = useState(false)
  const [interestedEmail, setInterestedEmail] = useState("")
  const [savingEmail, setSavingEmail] = useState(false)
  const [verifyingEmail, setVerifyingEmail] = useState(false)
  const [emailStatus, setEmailStatus] = useState<any>(null)
  
  const defaultCalLink = "https://cal.com/achraf-farhat-mbudrt/30min?layout=month_view" // Lien fourni par l'utilisateur

  useEffect(() => {
    fetchLists()
  }, [])

  const fetchLists = async () => {
    try {
      const res = await api.get('/lists')
      setLists(res || [])
    } catch (err) {
      console.error(err)
    }
  }

  const loadProspects = async (listId: string) => {
    setSelectedListId(listId)
    if (!listId) return;
    
    setLoading(true)
    try {
      const data = await api.get(`/prospects?listId=${listId}`)
      setAllProspects(data || [])
      applyFilter(data || [], filterMode)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const applyFilter = (data: any[], mode: FilterMode) => {
    let filtered = [...data]
    if (mode === 'new') {
      filtered = filtered.filter(p => p.callStatus === 'UNCALLED')
    } else if (mode === 'retry') {
      filtered = filtered.filter(p => ['VOICEMAIL', 'CALL_BACK', 'SKIPPED'].includes(p.callStatus))
    } else if (mode === 'all') {
      filtered = filtered.filter(p => !['NOT_INTERESTED', 'WRONG_NUMBER', 'INTERESTED'].includes(p.callStatus))
    }

    setProspects(filtered)
    setCurrentIndex(0)
    setNotes(filtered[0]?.callNotes || "")
  }

  const handleFilterChange = (mode: string) => {
    setFilterMode(mode as FilterMode)
    applyFilter(allProspects, mode as FilterMode)
  }

  const currentProspect = prospects[currentIndex]

  const handleStatusUpdate = async (status: string) => {
    if (!currentProspect) return

    setSavingStatus(status)
    try {
      await api.patch(`/prospects/${currentProspect.id}/call-status`, {
        callStatus: status,
        callNotes: notes
      })
      
      // Update local state
      const updatedAll = [...allProspects]
      const indexInAll = updatedAll.findIndex(p => p.id === currentProspect.id)
      if (indexInAll >= 0) {
        updatedAll[indexInAll] = { ...currentProspect, callStatus: status, callNotes: notes }
        setAllProspects(updatedAll)
      }

      const updatedProspects = [...prospects]
      updatedProspects[currentIndex] = { ...currentProspect, callStatus: status, callNotes: notes }
      setProspects(updatedProspects)

      if (status === 'INTERESTED') {
        // Au lieu de passer au suivant, on ouvre la modale
        setInterestedEmail(currentProspect.email || "")
        setEmailStatus(null)
        setShowInterestedModal(true)
      } else {
        // Auto-advance
        handleNext()
      }
    } catch (err) {
      console.error(err)
      alert("Erreur lors de la sauvegarde")
    } finally {
      setSavingStatus(null)
    }
  }

  const handleNext = () => {
    if (currentIndex < prospects.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setNotes(prospects[currentIndex + 1]?.callNotes || "")
    }
  }

  const handleSnooze = () => {
    if (!currentProspect || prospects.length <= 1) return;
    // Déplacer le prospect actuel à la fin du tableau
    const newProspects = [...prospects];
    const snoozedProspect = newProspects.splice(currentIndex, 1)[0];
    newProspects.push(snoozedProspect);
    
    setProspects(newProspects);
    // Le currentIndex ne change pas, mais l'élément à l'index actuel sera le "suivant" original
    setNotes(newProspects[currentIndex]?.callNotes || "");
  }

  const handleSaveEmail = async () => {
    if (!currentProspect) return;
    setSavingEmail(true);
    try {
      await api.put(`/prospects/${currentProspect.id}`, { email: interestedEmail })
      // Mettre à jour l'état local
      const updatedProspects = [...prospects]
      updatedProspects[currentIndex] = { ...currentProspect, email: interestedEmail }
      setProspects(updatedProspects)
      alert("E-mail sauvegardé avec succès !");
    } catch (err) {
      console.error(err)
      alert("Erreur lors de la sauvegarde de l'e-mail.")
    } finally {
      setSavingEmail(false)
    }
  }

  const handleVerifyEmail = async () => {
    if (!interestedEmail) return;
    setVerifyingEmail(true);
    setEmailStatus(null);
    try {
      const res = await api.post('/agents/verify-email', { email: interestedEmail });
      if (res.success) {
        setEmailStatus(res.result);
      } else {
        alert(res.message || "Erreur de vérification");
      }
    } catch (err) {
      console.error(err);
      alert("Impossible de vérifier l'e-mail");
    } finally {
      setVerifyingEmail(false);
    }
  }

  const closeInterestedModal = () => {
    setShowInterestedModal(false)
    handleNext()
  }

  const progressPercentage = allProspects.length > 0 ? Math.round((allProspects.filter(p => p.callStatus !== 'UNCALLED').length / allProspects.length) * 100) : 0

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">📞 CRM Dialer</h2>
          <p className="text-muted-foreground mt-1">Prospection téléphonique ultra-rapide</p>
        </div>
        <div className="flex items-center gap-4">
          <Tabs value={filterMode} onValueChange={handleFilterChange} className="w-[350px]">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="new">Nouveaux</TabsTrigger>
              <TabsTrigger value="retry">Relances</TabsTrigger>
              <TabsTrigger value="all">Tous actifs</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="w-[300px]">
            <Select value={selectedListId} onValueChange={loadProspects}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une liste" />
              </SelectTrigger>
              <SelectContent>
                {lists.map(list => (
                  <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : prospects.length === 0 ? (
        <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/30">
          <div className="text-center">
            <PhoneForwarded className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">Aucun prospect</h3>
            <p className="text-muted-foreground">Aucun prospect trouvé pour ce filtre dans cette liste.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex gap-6 min-h-0">
          
          {/* Main Dialer Card */}
          <Card className="flex-1 flex flex-col shadow-lg border-border">
            <CardHeader className="bg-muted/30 border-b pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className={(CALL_STATUSES as any)[currentProspect.callStatus]?.color}>
                      {(CALL_STATUSES as any)[currentProspect.callStatus]?.label || "Inconnu"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">Prospect {currentIndex + 1} sur {prospects.length} ({filterMode})</span>
                  </div>
                  <CardTitle className="text-3xl font-bold text-primary flex items-center gap-3">
                    <Building2 className="w-7 h-7 text-primary/70" />
                    {currentProspect.companyName}
                  </CardTitle>
                  <CardDescription className="text-lg mt-2 flex items-center gap-2">
                    <User className="w-5 h-5" />
                    {currentProspect.firstName} {currentProspect.lastName}
                    {currentProspect.jobTitle && <span className="text-muted-foreground">({currentProspect.jobTitle})</span>}
                  </CardDescription>
                </div>
                
                <div className="flex flex-col gap-2 items-end">
                  {currentProspect.phone && (
                    <Button size="lg" className="h-16 px-8 text-xl rounded-full shadow-md hover:shadow-lg transition-all" asChild>
                      <a href={`tel:${currentProspect.phone}`}>
                        📞 {currentProspect.phone}
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={handleSnooze} className="text-muted-foreground hover:text-foreground">
                    <Clock className="w-4 h-4 mr-2" /> Remettre à plus tard
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto bg-card">
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-4 bg-muted/50 rounded-lg border border-border">
                  <span className="text-muted-foreground block mb-1">Informations d'Enrichissement</span>
                  {currentProspect.enrichmentData?.companyAddress ? (
                    <p className="text-foreground">{currentProspect.enrichmentData.companyAddress}</p>
                  ) : (
                    <p className="text-muted-foreground italic">Aucune adresse</p>
                  )}
                  {currentProspect.enrichmentData?.googleMapsUrl && (
                    <a href={currentProspect.enrichmentData.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline mt-2 inline-block">
                      📍 Voir sur Google Maps
                    </a>
                  )}
                </div>
                
                <div className="p-4 bg-muted/50 rounded-lg border border-border">
                  <span className="text-muted-foreground block mb-1">Contact & Secteur</span>
                  <p className="font-medium text-foreground">{currentProspect.email || "Email inconnu"}</p>
                  <p className="font-medium mt-1 text-foreground">{currentProspect.industry || "Secteur non renseigné"}</p>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-2">
                <label className="text-sm font-semibold flex justify-between items-end">
                  Notes d'appel
                  <span className="text-xs font-normal text-muted-foreground">Sauvegarde automatique à la qualification</span>
                </label>
                <Textarea 
                  placeholder="Ex: Le dirigeant est en congé jusqu'à lundi, rappeler le matin..."
                  className="flex-1 min-h-[80px] resize-none text-base p-4 bg-background"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm font-semibold mb-4 text-center text-muted-foreground">QUALIFIER L'APPEL (Passe automatiquement au suivant)</p>
                <div className="grid grid-cols-3 gap-3">
                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="h-14 text-red-500 hover:bg-red-500/10 hover:text-red-600 border-red-500/20"
                    onClick={() => handleStatusUpdate('NOT_INTERESTED')}
                    disabled={savingStatus !== null}
                  >
                    {savingStatus === 'NOT_INTERESTED' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ThumbsDown className="w-5 h-5 mr-2" /> Pas intéressé</>}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="h-14 text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-600 border-yellow-500/20"
                    onClick={() => handleStatusUpdate('VOICEMAIL')}
                    disabled={savingStatus !== null}
                  >
                    {savingStatus === 'VOICEMAIL' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Voicemail className="w-5 h-5 mr-2" /> Répondeur</>}
                  </Button>

                  <Button 
                    variant="default" 
                    size="lg" 
                    className="h-14 bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg border-0"
                    onClick={() => handleStatusUpdate('INTERESTED')}
                    disabled={savingStatus !== null}
                  >
                    {savingStatus === 'INTERESTED' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ThumbsUp className="w-5 h-5 mr-2" /> Intéressé !</>}
                  </Button>

                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="h-14 text-blue-500 hover:bg-blue-500/10 hover:text-blue-600 border-blue-500/20"
                    onClick={() => handleStatusUpdate('CALL_BACK')}
                    disabled={savingStatus !== null}
                  >
                    {savingStatus === 'CALL_BACK' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><PhoneForwarded className="w-5 h-5 mr-2" /> À rappeler</>}
                  </Button>

                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="h-14 text-muted-foreground hover:bg-muted border-border"
                    onClick={() => handleStatusUpdate('SKIPPED')}
                    disabled={savingStatus !== null}
                  >
                    {savingStatus === 'SKIPPED' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><FastForward className="w-5 h-5 mr-2" /> Passer (Invalide)</>}
                  </Button>

                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="h-14 text-orange-500 hover:bg-orange-500/10 hover:text-orange-600 border-orange-500/20"
                    onClick={() => handleStatusUpdate('WRONG_NUMBER')}
                    disabled={savingStatus !== null}
                  >
                    {savingStatus === 'WRONG_NUMBER' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><PhoneMissed className="w-5 h-5 mr-2" /> Faux Numéro</>}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sidebar Progress */}
          <div className="w-64 flex flex-col gap-4">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <div className="text-3xl font-bold text-primary mb-1">{progressPercentage}%</div>
                <div className="text-sm text-muted-foreground">Progression Globale</div>
                <div className="w-full bg-slate-200 h-2 rounded-full mt-3 overflow-hidden">
                  <div className="bg-primary h-full transition-all duration-500" style={{ width: `${progressPercentage}%` }}></div>
                </div>
              </CardContent>
            </Card>

            <Card className="flex-1 overflow-hidden flex flex-col">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-sm font-semibold">Prochains appels ({prospects.length - currentIndex - 1})</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-y-auto flex-1 bg-card">
                {prospects.slice(currentIndex + 1, currentIndex + 10).map((p, i) => (
                  <div key={p.id + i} className="p-3 border-b border-border text-sm flex flex-col gap-1 hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setCurrentIndex(currentIndex + 1 + i)}>
                    <div className="font-semibold text-foreground truncate">{p.companyName}</div>
                    <div className="text-xs text-muted-foreground flex justify-between">
                      {p.phone || 'Pas de numéro'}
                      <Badge variant="outline" className={`text-[9px] h-4 ${(CALL_STATUSES as any)[p.callStatus]?.color}`}>
                        {(CALL_STATUSES as any)[p.callStatus]?.label}
                      </Badge>
                    </div>
                  </div>
                ))}
                {prospects.length - currentIndex - 10 > 0 && (
                  <div className="p-3 text-center text-xs text-muted-foreground italic">
                    + {prospects.length - currentIndex - 10} autres...
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      )}

      {/* MODAL INTÉRESSÉ */}
      <Dialog open={showInterestedModal} onOpenChange={setShowInterestedModal}>
        <DialogContent className="w-[95vw] sm:max-w-[90vw] md:max-w-[85vw] lg:max-w-6xl h-[95vh] flex flex-col gap-0 p-0 overflow-hidden rounded-xl">
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-6 text-white text-center flex-shrink-0 shadow-sm">
            <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
              <ThumbsUp className="w-6 h-6" />
              Super ! Le prospect est intéressé 🎉
            </h2>
            <p className="opacity-90 mt-1">Prenez le temps de noter son e-mail et de planifier le rendez-vous.</p>
          </div>
          
          <div className="p-6 flex-1 min-h-0 overflow-y-auto grid lg:grid-cols-[1fr_400px] gap-8 bg-slate-50/30">
            
            <div className="flex flex-col gap-4 h-full">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                <Calendar className="w-5 h-5 text-emerald-500" />
                Planifier le Rendez-vous
              </h3>
              <div className="flex-1 bg-white rounded-xl border shadow-sm overflow-hidden min-h-[600px]">
                {/* Intégration Cal.com en iframe standard */}
                <iframe 
                  src={defaultCalLink} 
                  className="w-full h-full border-0"
                  title="Cal.com Booking"
                />
              </div>
            </div>

            <div className="flex flex-col gap-6 lg:border-l lg:pl-8 h-full">
              <div className="space-y-4 bg-white p-5 rounded-xl border shadow-sm">
                <h3 className="font-semibold text-base text-slate-800">Informations Contact</h3>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">E-mail à envoyer l'invitation :</label>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <Input 
                        value={interestedEmail}
                        onChange={(e) => setInterestedEmail(e.target.value)}
                        placeholder="email@entreprise.com"
                        className="flex-1"
                      />
                      <Button 
                        variant="secondary" 
                        onClick={handleVerifyEmail}
                        disabled={verifyingEmail || !interestedEmail}
                        title="Vérifier la validité de l'e-mail"
                      >
                        {verifyingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-blue-600" />}
                      </Button>
                    </div>

                    {emailStatus && (
                      <div className={`text-sm p-3 rounded-md flex items-start gap-2 ${emailStatus.isValid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {emailStatus.isValid ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                        <div className="flex flex-col">
                          <span className="font-medium">{emailStatus.isValid ? 'E-mail valide' : 'Attention : E-mail invalide ou risqué'}</span>
                          {emailStatus.score !== undefined && <span className="text-xs opacity-80">Score de confiance : {emailStatus.score}/100</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <Button 
                  onClick={handleSaveEmail} 
                  disabled={savingEmail || !interestedEmail} 
                  variant="default"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white"
                >
                  {savingEmail ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Sauvegarder l'e-mail
                </Button>
              </div>

              <div className="space-y-3 bg-white p-5 rounded-xl border shadow-sm flex-1 flex flex-col">
                <h3 className="font-semibold text-base text-slate-800">Notes pour le rendez-vous</h3>
                <Textarea 
                  className="flex-1 min-h-[150px] resize-none focus-visible:ring-emerald-500"
                  placeholder="Points clés discutés, objectifs du rendez-vous..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

          </div>

          <DialogFooter className="p-4 border-t bg-slate-50">
            <Button variant="ghost" onClick={() => setShowInterestedModal(false)}>
              Annuler
            </Button>
            <Button onClick={closeInterestedModal} className="bg-primary text-white">
              Clôturer et Passer au suivant
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
