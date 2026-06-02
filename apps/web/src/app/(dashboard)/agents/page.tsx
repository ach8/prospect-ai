"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Bot, UploadCloud, Eraser, Loader2, Search, Target } from "lucide-react"
import { api } from "@/lib/api"

import { CleanerMappingDialog } from "./components/cleaner-mapping-dialog"

const INDUSTRIES = [
  "Logiciel & IT (SaaS, Tech)",
  "E-commerce & Retail",
  "Agences (Marketing, Web, SEO)",
  "Immobilier & Proptech",
  "Finance & Assurance",
  "Santé & Bien-être",
  "Éducation & Formation",
  "Industrie & Production",
  "BTP & Construction",
  "Services aux entreprises (Conseil, RH, Juridique)",
  "Transport & Logistique",
  "Hôtellerie & Restauration",
  "Autre"
] as const;

export default function AgentsPage() {
  const [targetAudience, setTargetAudience] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Sourcing Agent State
  const [sourcingPrompt, setSourcingPrompt] = useState("")
  const [sourcingCount, setSourcingCount] = useState<number>(100)
  const [isWeblessOnly, setIsWeblessOnly] = useState(false)
  const [isSourcingLoading, setIsSourcingLoading] = useState(false)
  const [activeJobs, setActiveJobs] = useState<any[]>([])
  const [lists, setLists] = useState<any[]>([])
  const [selectedList, setSelectedList] = useState("")
  const [excludeListIds, setExcludeListIds] = useState<string[]>([])

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const { jobs } = await api.get('/agents/research/jobs');
        // Afficher les 5 derniers jobs, peu importe le statut
        setActiveJobs(jobs.slice(0, 5));
      } catch (e) {
        console.error(e);
      }
    };
    
    const fetchLists = async () => {
      try {
        const res = await api.get('/lists');
        setLists(Array.isArray(res) ? res : res.data || res.lists || []);
      } catch (e) {
        console.error("Erreur chargement des listes", e);
      }
    };

    fetchJobs();
    fetchLists();
    const interval = setInterval(fetchJobs, 5000); // Polling toutes les 5 secondes
    return () => clearInterval(interval);
  }, []);

  const handlePrepareCleaning = () => {
    if (!file || !targetAudience) return
    setDialogOpen(true)
  }

  const handleCleanSuccess = () => {
    setFile(null)
    setTargetAudience("")
    alert("Fichier nettoyé avec succès ! Les prospects rejetés ont été sauvegardés.")
  }

  const [newListName, setNewListName] = useState("")

  const handleStartSourcing = async () => {
    if (!sourcingPrompt || sourcingCount < 1) return;
    if (selectedList === 'new' && !newListName.trim()) {
      alert("Veuillez entrer un nom pour la nouvelle liste.");
      return;
    }
    
    setIsSourcingLoading(true);
    try {
      let finalListId = selectedList;
      if (selectedList === 'new') {
        const newList = await api.post('/lists', { name: newListName.trim() });
        finalListId = newList.id;
      }

      await api.post('/agents/research/async', {
        prompt: sourcingPrompt,
        targetCount: Number(sourcingCount),
        listId: finalListId === 'new' || !finalListId ? undefined : finalListId,
        excludeListIds: excludeListIds.length > 0 ? excludeListIds : undefined,
        weblessOnly: isWeblessOnly
      });
      alert(`Recherche asynchrone lancée pour ${sourcingCount} leads ! L'agent travaille en arrière-plan.`);
      setSourcingPrompt("");
      setNewListName("");
      setExcludeListIds([]);
      // Refresh direct
      const { jobs } = await api.get('/agents/research/jobs');
      setActiveJobs(jobs.slice(0, 5));
    } catch (e) {
      alert("Erreur lors du lancement de la recherche");
    } finally {
      setIsSourcingLoading(false);
    }
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Agents IA</h2>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* CARTE AGENT NETTOYEUR */}
        <Card className="flex flex-col border-purple-500/20 bg-gradient-to-b from-card to-purple-500/5 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 bg-purple-500/20 rounded-lg text-purple-500">
                <Eraser className="w-5 h-5" />
              </div>
              Agent Nettoyeur
            </CardTitle>
            <CardDescription>
              Donnez un fichier CSV brut et votre cible. L'IA supprimera les prospects hors-sujet.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label>Cible / Secteur visé</Label>
              <select 
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>Sélectionnez un secteur...</option>
                {INDUSTRIES.map(ind => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Fichier CSV de prospects</Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="file" 
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full bg-purple-600 hover:bg-purple-700 text-white" 
              onClick={handlePrepareCleaning}
              disabled={!file || !targetAudience}
            >
              <Bot className="w-4 h-4 mr-2" /> Préparer le nettoyage
            </Button>
          </CardFooter>
        </Card>

        {/* CARTE AGENT DE SOURCING (ASYNCHRONE) */}
        <Card className="flex flex-col border-blue-500/20 bg-gradient-to-b from-card to-blue-500/5 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 bg-blue-500/20 rounded-lg text-blue-500">
                <Search className="w-5 h-5" />
              </div>
              Agent Sourcing (Volume)
            </CardTitle>
            <CardDescription>
              Cherche des centaines de leads ultra-ciblés en arrière-plan sans bloquer votre écran.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            <div className="space-y-2">
              <Label>Description de la cible</Label>
              <Textarea 
                placeholder="Ex: Sites e-commerce de mode éthique en France..."
                value={sourcingPrompt}
                onChange={(e) => setSourcingPrompt(e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Nombre de leads souhaités</Label>
              <Input 
                type="number" 
                min={10}
                step={10}
                value={sourcingCount}
                onChange={(e) => setSourcingCount(parseInt(e.target.value) || 10)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ajouter à la liste (Optionnel)</Label>
              <select 
                value={selectedList}
                onChange={(e) => setSelectedList(e.target.value)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">-- Aucune (Prospects globaux) --</option>
                <option value="new">+ Créer une nouvelle liste...</option>
                {lists.map(list => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </select>
            </div>
            {selectedList === 'new' && (
              <div className="space-y-2 mt-2">
                <Label>Nom de la nouvelle liste</Label>
                <Input 
                  placeholder="Ex: Campagne Ecommerce 2026..."
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  autoFocus
                />
              </div>
            )}
            
            <div className="space-y-2 pt-2 border-t border-white/5">
              <Label>Listes à exclure (Optionnel)</Label>
              <div className="text-[11px] text-muted-foreground leading-tight mb-1">
                Maintenez Ctrl (ou Cmd sur Mac) pour en sélectionner plusieurs. L'IA recevra la consigne stricte de ne jamais proposer les domaines de ces listes.
              </div>
              <select 
                multiple
                value={excludeListIds}
                onChange={(e) => {
                  const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
                  setExcludeListIds(selectedOptions);
                }}
                className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[100px]"
              >
                {lists.map(list => (
                  <option key={list.id} value={list.id} className="py-1 px-1">{list.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2 pt-2 border-t border-white/5">
              <Checkbox 
                id="webless" 
                checked={isWeblessOnly}
                onCheckedChange={(checked) => setIsWeblessOnly(checked as boolean)}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="webless"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Entreprises "Sans Site Web" uniquement
                </label>
                <p className="text-xs text-muted-foreground">
                  L'IA ciblera exclusivement les commerces qui ne possèdent pas de site web. Idéal pour prospecter des commerces locaux à la main.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white" 
              onClick={handleStartSourcing}
              disabled={!sourcingPrompt || isSourcingLoading}
            >
              {isSourcingLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Target className="w-4 h-4 mr-2" />}
              {isSourcingLoading ? "Lancement..." : "Lancer le Sourcing"}
            </Button>
          </CardFooter>
        </Card>

        {/* AUTRES AGENTS (Placeholder) */}
        <Card className="flex flex-col border-dashed opacity-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 bg-muted rounded-lg text-muted-foreground">
                <Bot className="w-5 h-5" />
              </div>
              Agent d'Enrichissement
            </CardTitle>
            <CardDescription>
              Enrichit automatiquement les données de vos prospects (Emails, LinkedIn, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center">
            <span className="text-sm font-medium text-muted-foreground">Bientôt disponible ici</span>
          </CardContent>
        </Card>

      </div>

      {/* SUIVI EN TEMPS REEL DES MISSIONS */}
      {activeJobs.length > 0 && (
        <div className="mt-8 space-y-4">
          <h3 className="text-xl font-semibold">Historique des recherches récentes</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {activeJobs.map((job) => (
              <Card key={job.id} className={`border ${job.status === 'COMPLETED' ? 'border-green-200 bg-green-50/50' : job.status === 'FAILED' ? 'border-red-200' : 'border-blue-200'}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex justify-between items-center">
                    <span className="truncate pr-4 flex-1" title={job.prompt}>{job.prompt}</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      job.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                      job.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {job.status === 'COMPLETED' ? 'Terminé' : job.status === 'FAILED' ? 'Erreur' : 'En cours...'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between text-sm font-medium mb-1">
                    <span>Progression du Sourcing</span>
                    <span>{job.foundCount} / {job.targetCount} leads</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2.5 mt-2">
                    <div 
                      className={`${job.status === 'COMPLETED' ? 'bg-green-500' : 'bg-blue-600'} h-2.5 rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min(100, Math.max(5, (job.foundCount / job.targetCount) * 100))}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    {job.status === 'COMPLETED' 
                      ? "Recherche terminée ! Retrouvez ces leads dans l'onglet Prospects." 
                      : "L'agent Sourcer cherche par lots de 10. Les leads validés s'ajouteront automatiquement à vos prospects."}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {file && (
        <CleanerMappingDialog 
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          file={file}
          targetAudience={targetAudience}
          onCleanSuccess={handleCleanSuccess}
        />
      )}
    </div>
  )
}
