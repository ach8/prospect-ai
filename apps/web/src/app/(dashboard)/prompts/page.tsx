"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Library, Plus, Save, Trash2, CheckCircle2, Clock, Bot, Target } from "lucide-react"

interface PromptTemplateStep {
  stepOrder: number;
  agentType: string;
  delayHours: number;
  aiPrompt: string;
}

interface PromptTemplate {
  id: string
  name: string
  description?: string
  globalContext?: string
  visualAuditPrompt?: string
  campaignObjective?: string
  steps?: PromptTemplateStep[] | any
  subjectPrompt?: string
  firstTouchPrompt?: string
  followUpPrompt?: string
  closerPrompt?: string
  isDefault: boolean
  createdAt: string
}

export default function PromptsLibraryPage() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([])
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form State
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [globalContext, setGlobalContext] = useState("")
  const [visualAuditPrompt, setVisualAuditPrompt] = useState("")
  const [campaignObjective, setCampaignObjective] = useState("")
  const [steps, setSteps] = useState<PromptTemplateStep[]>([])
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    fetchPrompts()
  }, [])

  const fetchPrompts = async () => {
    try {
      setLoading(true)
      const data = await api.get('/prompts')
      setPrompts(data)
    } catch (error) {
      console.error("Failed to fetch prompts", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPrompt = (prompt: PromptTemplate) => {
    setSelectedPromptId(prompt.id)
    setName(prompt.name)
    setDescription(prompt.description || "")
    setGlobalContext(prompt.globalContext || "")
    setVisualAuditPrompt(prompt.visualAuditPrompt || "")
    setCampaignObjective(prompt.campaignObjective || "")
    setIsDefault(prompt.isDefault)

    // Si on a des steps dynamiques, on les utilise
    if (prompt.steps && Array.isArray(prompt.steps) && prompt.steps.length > 0) {
      setSteps(prompt.steps)
    } else {
      // Fallback vers les anciens champs
      const fallbackSteps = []
      if (prompt.firstTouchPrompt) {
        fallbackSteps.push({ stepOrder: 1, agentType: "FIRST_TOUCH", delayHours: 0, aiPrompt: prompt.firstTouchPrompt })
      }
      if (prompt.subjectPrompt) {
        fallbackSteps.push({ stepOrder: 2, agentType: "SUBJECT", delayHours: 0, aiPrompt: prompt.subjectPrompt })
      }
      if (prompt.followUpPrompt) {
        fallbackSteps.push({ stepOrder: 3, agentType: "FOLLOW_UP", delayHours: 48, aiPrompt: prompt.followUpPrompt })
      }
      if (prompt.closerPrompt) {
        fallbackSteps.push({ stepOrder: 4, agentType: "CLOSER", delayHours: 72, aiPrompt: prompt.closerPrompt })
      }
      setSteps(fallbackSteps)
    }
  }

  const handleCreateNew = () => {
    setSelectedPromptId(null)
    setName("Nouvelle Stratégie")
    setDescription("")
    setGlobalContext("")
    setVisualAuditPrompt("")
    setCampaignObjective("")
    setSteps([
      { stepOrder: 1, agentType: "FIRST_TOUCH", delayHours: 0, aiPrompt: "" },
      { stepOrder: 2, agentType: "SUBJECT", delayHours: 0, aiPrompt: "" },
      { stepOrder: 3, agentType: "FOLLOW_UP", delayHours: 48, aiPrompt: "" },
      { stepOrder: 4, agentType: "CLOSER", delayHours: 72, aiPrompt: "" }
    ])
    setIsDefault(false)
  }

  const handleSave = async () => {
    if (!name) return alert("Le nom est requis.")
    
    try {
      setSaving(true)
      
      // Clean up steps order
      const orderedSteps = steps.map((s, i) => ({ ...s, stepOrder: i + 1 }))
      
      const payload = { 
        name, 
        description,
        globalContext,
        visualAuditPrompt,
        campaignObjective,
        steps: orderedSteps,
        isDefault 
      }

      if (selectedPromptId) {
        await api.patch(`/prompts/${selectedPromptId}`, payload)
      } else {
        await api.post('/prompts', payload)
      }
      
      await fetchPrompts()
      alert("Template sauvegardé avec succès.")
    } catch (error) {
      alert("Erreur lors de la sauvegarde.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette stratégie ?")) return
    try {
      await api.delete(`/prompts/${id}`)
      if (selectedPromptId === id) handleCreateNew()
      await fetchPrompts()
    } catch (error) {
      alert("Erreur lors de la suppression.")
    }
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Library className="w-8 h-8 text-primary" />
          Bibliothèque de Prompts (Stratégies)
        </h2>
        <Button onClick={handleCreateNew}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle Stratégie
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Liste des Prompts */}
        <div className="col-span-4 border rounded-xl bg-card overflow-y-auto max-h-[calc(100vh-150px)]">
          <div className="p-4 border-b font-semibold bg-muted/50">Vos Stratégies</div>
          <div className="p-2 space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground p-4">Chargement...</p>
            ) : prompts.map((prompt) => (
              <div 
                key={prompt.id} 
                onClick={() => handleSelectPrompt(prompt)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedPromptId === prompt.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-sm">{prompt.name}</h4>
                  </div>
                  {prompt.isDefault && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      Défaut
                    </span>
                  )}
                </div>
              </div>
            ))}
            {prompts.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground p-4 text-center">Aucune stratégie trouvée.</p>
            )}
          </div>
        </div>

        {/* Editeur */}
        <div className="col-span-8 flex flex-col max-h-[calc(100vh-150px)]">
          <Card className="flex-1 flex flex-col border-primary/20 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 border-b pb-4 shrink-0">
              <CardTitle>{selectedPromptId ? 'Modifier la Stratégie' : 'Créer une Stratégie'}</CardTitle>
              <CardDescription>
                Définissez les instructions globales et la séquence des agents IA.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-6 pt-6 pb-20">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2 md:col-span-1">
                  <Label>Nom de la stratégie</Label>
                  <Input 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="Ex: Outreach Hybrid"
                  />
                </div>
                <div className="space-y-2 col-span-2 md:col-span-1">
                  <Label>Description (interne)</Label>
                  <Input 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    placeholder="Ex: Vouvoiement, très humain, axé sur la friction visuelle."
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 py-2">
                <input 
                  type="checkbox" 
                  id="default-check" 
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                />
                <Label htmlFor="default-check" className="font-normal cursor-pointer">
                  Définir comme stratégie par défaut
                </Label>
              </div>

              {/* Objectif de la campagne */}
              <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-4 space-y-2">
                <Label className="text-violet-700 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Objectif de la Campagne & CTA
                </Label>
                <Textarea 
                  value={campaignObjective}
                  onChange={(e) => setCampaignObjective(e.target.value)}
                  className="min-h-[100px] font-mono text-xs"
                  placeholder="Exemple: 'Nous proposons une solution de SAV automatisé avec IA. L'objectif est d'obtenir un échange rapide. CTA : proposer d'envoyer une courte vidéo démo personnalisée de 2 minutes.'"
                />
                <p className="text-xs text-muted-foreground">
                  L'IA adaptera chaque email en fonction de cet objectif.
                </p>
              </div>

              {/* Contexte Global & Audit Visuel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 border rounded-lg bg-orange-500/5 border-orange-500/20">
                <div className="space-y-2">
                  <Label className="text-orange-700">Contexte Global (Partagé)</Label>
                  <Textarea 
                    value={globalContext}
                    onChange={(e) => setGlobalContext(e.target.value)}
                    className="min-h-[150px] font-mono text-xs"
                    placeholder="Instructions globales (ton de voix, tutoiement, philosophie...)"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-orange-700">Instructions d'Audit Visuel (Scraping)</Label>
                  <Textarea 
                    value={visualAuditPrompt}
                    onChange={(e) => setVisualAuditPrompt(e.target.value)}
                    className="min-h-[150px] font-mono text-xs"
                    placeholder="Ce que l'agent de vision doit chercher sur le site web..."
                  />
                </div>
              </div>

              {/* Sequence Steps Prompts */}
              <div className="space-y-6 pt-4">
                <h3 className="font-semibold mb-2 text-muted-foreground uppercase text-xs tracking-wider">Agents Séquence Email (Follow-ups)</h3>
                
                <div className="relative pl-6 flex flex-col gap-6 border-l-2 border-muted ml-2">
                  {steps.map((step, index) => (
                    <div key={index} className="relative">
                      {/* Ligne pointillée et connecteur */}
                      <div className="absolute -left-[35px] top-4 w-6 h-6 rounded-full bg-background border-2 border-primary flex items-center justify-center z-10">
                        <span className="text-xs font-bold text-primary">{index + 1}</span>
                      </div>

                      <div className="bg-card border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                              <Bot className="w-4 h-4 text-purple-500" />
                              <Input 
                                value={step.agentType}
                                onChange={(e) => {
                                  const newSteps = steps.map((s, i) => i === index ? { ...s, agentType: e.target.value.toUpperCase().replace(/\s+/g, '_') } : s);
                                  setSteps(newSteps);
                                }}
                                className="h-8 text-sm font-semibold w-[150px]"
                                placeholder="Agent Type"
                              />
                            </h3>
                            {index > 0 && (
                              <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <Input 
                                  type="number" 
                                  value={step.delayHours}
                                  onChange={(e) => {
                                    const newSteps = steps.map((s, i) => i === index ? { ...s, delayHours: parseInt(e.target.value) || 0 } : s);
                                    setSteps(newSteps);
                                  }}
                                  className="h-8 text-xs w-[70px]"
                                />
                                <span className="text-xs text-muted-foreground">h</span>
                              </div>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => {
                            setSteps(steps.filter((_, i) => i !== index))
                          }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Prompt (Instructions pour cet email)</Label>
                          <Textarea 
                            className="min-h-[100px] font-mono text-xs"
                            value={step.aiPrompt || ''}
                            onChange={(e) => {
                              const newSteps = steps.map((s, i) => i === index ? { ...s, aiPrompt: e.target.value } : s);
                              setSteps(newSteps);
                            }}
                            placeholder="Instructions pour générer cet email..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-center mt-4">
                  <Button variant="outline" className="border-dashed" onClick={() => {
                    setSteps([...steps, { stepOrder: steps.length + 1, agentType: "FOLLOW_UP", delayHours: 48, aiPrompt: "" }])
                  }}>
                    <Plus className="w-4 h-4 mr-2" /> Ajouter un Agent / Étape
                  </Button>
                </div>
              </div>

            </CardContent>
            <CardFooter className="border-t bg-muted/20 p-4 flex justify-between shrink-0">
              {selectedPromptId ? (
                <Button variant="destructive" size="sm" onClick={() => handleDelete(selectedPromptId)}>
                  <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                </Button>
              ) : (
                <div />
              )}
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" /> {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
