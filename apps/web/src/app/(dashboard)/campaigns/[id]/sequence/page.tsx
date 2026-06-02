"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Plus, Save, Play, Bot, User, Trash2, Clock, UploadCloud, Download, Eye, Zap, Target } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Edit2, Sparkles, Loader2 } from "lucide-react"



export default function SequenceBuilderPage() {
  const { id } = useParams()
  const router = useRouter()
  const [campaign, setCampaign] = useState<any>(null)
  const [steps, setSteps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState<any>(null)
  const [promptTemplates, setPromptTemplates] = useState<any[]>([])

  // States pour l'édition et réécriture IA
  const [editingMsg, setEditingMsg] = useState<any>(null)
  const [aiRewritingMsg, setAiRewritingMsg] = useState<any>(null)
  const [aiInstruction, setAiInstruction] = useState("")
  const [isAiWorking, setIsAiWorking] = useState(false)

  // States pour sauvegarder un template
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState("")
  const [newTemplateDesc, setNewTemplateDesc] = useState("")
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Context pour le Knowledge (Global à la campagne)
  const [globalContext, setGlobalContext] = useState("")
  const [visualAuditPrompt, setVisualAuditPrompt] = useState("")
  const [campaignObjective, setCampaignObjective] = useState("")

  // Polling de la progression de génération
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchStatus = async () => {
      try {
        const res = await api.get(`/campaigns/${id}/status`);
        setGenerationStatus(res);
        
        // Si la génération est terminée, on peut arrêter de forcer le state "generating"
        if (res.totalExpectedMessages > 0 && res.generatedMessagesCount >= res.totalExpectedMessages) {
          setGenerating(false);
        }
      } catch (err) {
        console.error("Erreur polling status:", err);
      }
    };

    if (generating || (generationStatus && generationStatus.generatedMessagesCount < generationStatus.totalExpectedMessages)) {
      interval = setInterval(fetchStatus, 5000);
    }

    // Un premier fetch au chargement si possible
    fetchStatus();

    return () => clearInterval(interval);
  }, [id, generating, generationStatus?.generatedMessagesCount, generationStatus?.totalExpectedMessages]);

  const fetchCampaign = async () => {
    try {
      const [campaignData, templatesData] = await Promise.all([
        api.get(`/campaigns/${id}`),
        api.get('/prompts')
      ])
      setCampaign(campaignData)
      setPromptTemplates(templatesData)
      
      if (campaignData.steps && campaignData.steps.length > 0) {
        // Sort by order
        const sorted = [...campaignData.steps].sort((a, b) => a.stepOrder - b.stepOrder)
        setSteps(sorted)
      } else {
        // Init 4 default steps based on user requirements
        setSteps([
          { stepOrder: 1, agentType: "FIRST_TOUCH", templateType: "AI_GENERATED", delayHours: 0, aiPrompt: "" },
          { stepOrder: 2, agentType: "SUBJECT", templateType: "AI_GENERATED", delayHours: 0, aiPrompt: "" },
          { stepOrder: 3, agentType: "FOLLOW_UP", templateType: "AI_GENERATED", delayHours: 48, aiPrompt: "" },
          { stepOrder: 4, agentType: "CLOSER", templateType: "AI_GENERATED", delayHours: 72, aiPrompt: "" }
        ])
      }

      if (campaignData.aiConfig?.globalContext) {
        setGlobalContext(campaignData.aiConfig.globalContext)
      }
      if (campaignData.aiConfig?.visualAuditPrompt) {
        setVisualAuditPrompt(campaignData.aiConfig.visualAuditPrompt)
      }
      if (campaignData.aiConfig?.campaignObjective) {
        setCampaignObjective(campaignData.aiConfig.campaignObjective)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCampaign()
  }, [id])

  const saveSequence = async () => {
    setSaving(true)
    try {
      // Re-order steps cleanly and remove extra fields (id, createdAt, etc.) which cause ValidationPipe 400 Bad Request
      const orderedSteps = steps.map((s, i) => {
        let validAgentType = s.agentType;
        if (!['SUBJECT', 'FIRST_TOUCH', 'FOLLOW_UP', 'CLOSER', 'VISUAL_AUDIT'].includes(validAgentType)) {
          validAgentType = 'FOLLOW_UP';
        }
        const cleanStep = { ...s, stepOrder: i + 1, agentType: validAgentType };
        // On garde l'ID pour que le backend puisse mettre à jour la bonne ligne sans corrompre les relations
        delete (cleanStep as any).campaignId;
        delete (cleanStep as any).createdAt;
        delete (cleanStep as any).updatedAt;
        return cleanStep;
      });
      
      // Update steps
      await api.put(`/campaigns/${id}/steps`, { steps: orderedSteps })
      
      // Update global context in campaign aiConfig
      const newConfig = { ...(campaign?.aiConfig || {}), globalContext, visualAuditPrompt, campaignObjective }
      await api.put(`/campaigns/${id}`, { aiConfig: newConfig })
      
      // Rafraîchir les données pour récupérer les vrais IDs générés en base de données
      // Cela évite que les étapes "nouvelles" n'aient un id indéfini et soient recréées à l'infini à chaque sauvegarde.
      await fetchCampaign()
      
      alert("Séquence enregistrée avec succès !")
    } catch (err) {
      console.error(err)
      alert("Erreur lors de l'enregistrement : " + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const fetchStatusGlobal = async () => {
    try {
      const res = await api.get(`/campaigns/${id}/status`)
      setGenerationStatus(res)
    } catch (err) {
      console.error(err)
    }
  }

  const handleSaveManualEdit = async () => {
    if (!editingMsg) return
    try {
      await api.put(`/campaigns/${id}/messages/${editingMsg.id}`, {
        subject: editingMsg.subject,
        body: editingMsg.body
      })
      setEditingMsg(null)
      fetchStatusGlobal()
    } catch (err) {
      console.error(err)
      alert("Erreur lors de la sauvegarde")
    }
  }

  const handleAiRewrite = async () => {
    if (!aiRewritingMsg || !aiInstruction) return
    setIsAiWorking(true)
    try {
      await api.post(`/campaigns/${id}/messages/${aiRewritingMsg.id}/regenerate`, {
        instruction: aiInstruction
      })
      setAiRewritingMsg(null)
      setAiInstruction("")
      fetchStatusGlobal()
    } catch (err) {
      console.error(err)
      alert("Erreur de l'IA")
    } finally {
      setIsAiWorking(false)
    }
  }

  const exportCSV = async () => {
    try {
      // The API returns a JSON array, we need to convert it to CSV
      const data = await api.get(`/campaigns/${id}/export`)
      if (!data || data.length === 0) {
        alert("Aucune donnée à exporter (Générez d'abord les emails).")
        return;
      }
      
      const headers = Object.keys(data[0])
      const csvRows = []
      csvRows.push(headers.join(','))
      
      for (const row of data) {
        const values = headers.map(header => {
          const escaped = ('' + (row[header] || '')).replace(/"/g, '""')
          return `"${escaped}"`
        })
        csvRows.push(values.join(','))
      }
      
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.setAttribute('hidden', '')
      a.setAttribute('href', url)
      a.setAttribute('download', `campaign_${id}_export.csv`)
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      console.error(err)
      alert("Erreur lors de l'export")
    }
  }

  const handleSaveTemplate = async () => {
    if (!newTemplateName) return;
    setSavingTemplate(true);
    try {
      const payload = {
        name: newTemplateName,
        description: newTemplateDesc,
        globalContext,
        visualAuditPrompt,
        campaignObjective,
        steps: steps.map((s, i) => {
          let validAgentType = s.agentType;
          if (!['SUBJECT', 'FIRST_TOUCH', 'FOLLOW_UP', 'CLOSER', 'VISUAL_AUDIT'].includes(validAgentType)) {
            validAgentType = 'FOLLOW_UP';
          }
          return { stepOrder: i + 1, agentType: validAgentType, delayHours: s.delayHours, aiPrompt: s.aiPrompt };
        }),
        subjectPrompt: steps.find(s => s.agentType === "SUBJECT")?.aiPrompt || "",
        firstTouchPrompt: steps.find(s => s.agentType === "FIRST_TOUCH")?.aiPrompt || "",
        followUpPrompt: steps.find(s => s.agentType === "FOLLOW_UP" || !['SUBJECT', 'FIRST_TOUCH', 'CLOSER', 'VISUAL_AUDIT'].includes(s.agentType))?.aiPrompt || "",
        closerPrompt: steps.find(s => s.agentType === "CLOSER")?.aiPrompt || "",
      };
      const newTemplate = await api.post('/prompts', payload);
      setPromptTemplates([...promptTemplates, newTemplate]);
      setSaveTemplateDialogOpen(false);
      setNewTemplateName("");
      setNewTemplateDesc("");
      alert("Template enregistré avec succès !");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'enregistrement du template");
    } finally {
      setSavingTemplate(false);
    }
  }

  const generateEmails = async () => {
    setGenerating(true)
    try {
      await saveSequence() // auto-save before generate
      await api.post(`/campaigns/${id}/generate`)
      alert("La génération IA des séquences a démarré en arrière-plan. Vous pouvez consulter les emails générés dans l'export CSV lorsqu'ils seront prêts.")
    } catch (err) {
      console.error(err)
      alert("Erreur au lancement de la génération")
      setGenerating(false)
    }
  }

  const stopGeneration = async () => {
    try {
      await api.post(`/campaigns/${id}/stop`)
      setGenerating(false)
      if (generationStatus) {
        setGenerationStatus({ ...generationStatus, generatedMessagesCount: 0, progress: 0 })
      }
      alert("Génération arrêtée. La file d'attente a été vidée et les emails effacés.")
    } catch (err) {
      console.error(err)
      alert("Erreur lors de l'arrêt de la génération")
    }
  }

  const isCampaignRunning = generating || (generationStatus && generationStatus.progress > 0 && generationStatus.progress < 100);

  if (loading) return <div className="p-8 text-center animate-pulse">Chargement...</div>

  return (
    <div className="flex flex-col gap-8 w-full max-w-[1000px] mx-auto animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/campaigns/${id}/verify`)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Générateur Multi-Agents</h1>
            <p className="text-muted-foreground mt-1">
              Configurez le style d'écriture humain et le rôle de chaque agent pour la campagne.
            </p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Exporter CSV
          </Button>
          <Button variant="secondary" onClick={saveSequence} disabled={saving || isCampaignRunning}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Sauvegarde..." : "Enregistrer"}
          </Button>
          
          {isCampaignRunning ? (
            <Button onClick={stopGeneration} variant="destructive">
              <span className="w-2 h-2 bg-white rounded-sm mr-2" />
              Stopper l'IA
            </Button>
          ) : (
            <Button onClick={generateEmails} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Play className="w-4 h-4 mr-2" />
              Lancer l'IA
            </Button>
          )}
        </div>
      </div>

      {/* SECTION CHOIX DE TEMPLATE */}
      <div className="bg-card border rounded-xl p-6 shadow-sm ring-1 ring-orange-500/10">
        <div className="flex gap-4 items-start">
          <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-orange-500" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-xl font-semibold">Templates de Stratégie (Préréglages)</h2>
              <Button variant="outline" size="sm" onClick={() => setSaveTemplateDialogOpen(true)}>
                <Save className="w-4 h-4 mr-2" />
                Sauvegarder ma config
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Sélectionnez une stratégie pour remplir automatiquement tous les prompts de la campagne avec des règles testées et optimisées. Vous pourrez toujours les modifier ensuite.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {promptTemplates.map((template) => (
                <div 
                  key={template.id} 
                  className="border rounded-lg p-4 cursor-pointer hover:border-orange-500/50 hover:bg-orange-500/5 transition-colors relative"
                  onClick={() => {
                    if (window.confirm("Appliquer ce template va écraser vos prompts actuels. Continuer ?")) {
                      if (template.globalContext) setGlobalContext(template.globalContext);
                      if (template.visualAuditPrompt) setVisualAuditPrompt(template.visualAuditPrompt);
                      if (template.campaignObjective) setCampaignObjective(template.campaignObjective);
                      
                      if (template.steps && Array.isArray(template.steps) && template.steps.length > 0) {
                        setSteps(template.steps.map((s: any, i: number) => {
                          let validAgentType = s.agentType;
                          if (!['SUBJECT', 'FIRST_TOUCH', 'FOLLOW_UP', 'CLOSER', 'VISUAL_AUDIT'].includes(validAgentType)) {
                            validAgentType = 'FOLLOW_UP';
                          }
                          return { ...s, stepOrder: i + 1, agentType: validAgentType };
                        }));
                      } else {
                        const newSteps = steps.map(step => {
                          let templatePrompt = "";
                          if (step.agentType === "SUBJECT") templatePrompt = template.subjectPrompt || "";
                          if (step.agentType === "FIRST_TOUCH") templatePrompt = template.firstTouchPrompt || "";
                          if (step.agentType === "FOLLOW_UP") templatePrompt = template.followUpPrompt || "";
                          if (step.agentType === "CLOSER") templatePrompt = template.closerPrompt || "";
                          
                          if (templatePrompt) {
                            return { ...step, aiPrompt: templatePrompt };
                          }
                          return step;
                        });
                        setSteps(newSteps);
                      }
                    }
                  }}
                >
                  <h3 className="font-semibold text-orange-500">{template.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION OBJECTIF & CTA */}
      <div className="bg-card border rounded-xl p-6 shadow-sm ring-1 ring-violet-500/10">
        <div className="flex gap-4 items-start">
          <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0">
            <Target className="w-6 h-6 text-violet-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-2">Objectif de la Campagne & CTA</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Décrivez votre <b>offre</b>, votre <b>objectif</b> et le <b>Call-to-Action</b> souhaité. L'IA adaptera chaque email en conséquence (ex: proposer une démo vidéo, un audit gratuit, un lien calendly).
            </p>
            <Textarea 
              className="min-h-[100px] font-mono text-sm bg-muted/30 border-violet-500/20 focus-visible:ring-violet-500"
              placeholder="Exemple: 'Nous proposons une solution de SAV automatisé avec IA. L'objectif est d'obtenir un échange rapide. CTA : proposer d'envoyer une courte vidéo démo personnalisée de 2 minutes.'"
              value={campaignObjective}
              onChange={(e) => setCampaignObjective(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* SECTION CONNAISSANCES & STYLE */}
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <div className="flex gap-4 items-start">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <UploadCloud className="w-6 h-6 text-blue-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-2">Contexte & Style de Copywriting</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Ici, collez vos guidelines de rédaction, des exemples d'emails que vous aimez, ou le profil de votre Persona. Ce contexte sera partagé par <b>tous les agents</b> pour garantir qu'ils écrivent comme vous (style humanisé).
            </p>
            <Textarea 
              className="min-h-[150px] font-mono text-sm bg-muted/30"
              placeholder="Exemple: 'Nous vendons un logiciel SaaS B2B. Ton de voix: Très amical, tutoiement, phrases courtes. Ne jamais dire 'Bonjour Madame/Monsieur'. Toujours utiliser le prénom...'"
              value={globalContext}
              onChange={(e) => setGlobalContext(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* SECTION AUDIT VISUEL */}
      <div className="bg-card border rounded-xl p-6 shadow-sm ring-1 ring-emerald-500/10">
        <div className="flex gap-4 items-start">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <Eye className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">Directives pour l'Audit Visuel</h2>
            <p className="text-sm text-muted-foreground mb-4">
              L'Agent Visuel analyse le site web du prospect en arrière-plan avant la rédaction. Indiquez-lui <b>exactement quoi chercher</b> pour repérer les points de friction (ex: absence de tel bouton, formulaire complexe).
            </p>
            <div className="flex flex-col gap-3">
              <Textarea 
                className="min-h-[100px] font-mono text-sm bg-muted/30 border-emerald-500/20 focus-visible:ring-emerald-500"
                placeholder="Exemple: 'Concentre-toi uniquement sur les formulaires de devis. Cherche à savoir s'ils utilisent un chatbot. Si non, considère ça comme la friction principale.'"
                value={visualAuditPrompt}
                onChange={(e) => setVisualAuditPrompt(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION PROGRESSION ET APERÇU */}
      {(generating || (generationStatus && generationStatus.totalExpectedMessages > 0)) && (
        <div className="bg-card border rounded-xl p-6 shadow-sm ring-1 ring-purple-500/20">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-500" />
              Progression de la Génération IA
            </h2>
            <Badge variant={generationStatus?.progress === 100 ? "default" : "secondary"}>
              {generationStatus?.progress === 100 ? "Terminé" : "En cours..."}
            </Badge>
          </div>
          
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span>{generationStatus?.generatedMessagesCount || 0} emails rédigés sur {generationStatus?.totalExpectedMessages || 0}</span>
              <span className="font-semibold">{generationStatus?.progress || 0}%</span>
            </div>
            <Progress value={generationStatus?.progress || 0} className="h-2" />
          </div>

          {/* PROSPECT EN COURS */}
          {generationStatus?.currentProcessingProspect && (
            <div className="mb-6 bg-primary/10 border border-primary/20 rounded-lg p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-xs text-primary font-bold uppercase tracking-wider">En cours d'analyse & rédaction...</div>
                  <div className="font-semibold">{generationStatus.currentProcessingProspect.name} <span className="text-muted-foreground font-normal">({generationStatus.currentProcessingProspect.company})</span></div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground ml-11">
                L'agent parcourt le web pour déduire les pain points et rédige la séquence sur-mesure. Cela peut prendre 1 à 2 minutes.
              </p>
            </div>
          )}

          {/* DERNIERS PROSPECTS TRAITÉS */}
          {generationStatus?.recentProspects && generationStatus.recentProspects.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Dernières séquences générées :</h3>
              <div className="flex flex-col gap-4 max-h-[500px] overflow-y-auto pr-2">
                {generationStatus.recentProspects.map((prospect: any) => (
                  <div key={prospect.id} className="bg-black/20 border border-white/5 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                      <div className="font-semibold text-primary text-lg">
                        {prospect.prospectName} <span className="text-muted-foreground font-normal text-sm">({prospect.companyName})</span>
                      </div>
                      <Badge variant="outline" className="bg-primary/5">{prospect.messages.length} emails générés</Badge>
                    </div>

                    {prospect.deepResearch && (
                      <div className="mb-4 bg-primary/5 rounded-md p-3 text-xs border border-primary/10">
                        <div className="font-semibold text-primary mb-1 flex items-center gap-2">
                           <Bot className="w-3 h-3" /> Analyse du profil & Pain points déduits
                        </div>
                        <div className="text-muted-foreground whitespace-pre-wrap">{prospect.deepResearch}</div>
                      </div>
                    )}
                    
                    <div className="flex flex-col gap-3">
                      {prospect.messages.map((msg: any) => (
                        <div key={msg.id} className="bg-background/40 rounded p-3 text-sm border border-white/5">
                          <div className="flex justify-between items-center mb-2">
                            <Badge variant="secondary" className="text-[10px] uppercase">{msg.agentType}</Badge>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => setEditingMsg(msg)}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-purple-400" onClick={() => setAiRewritingMsg(msg)}>
                                <Sparkles className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          {msg.subject && <div className="font-medium mb-1 text-foreground">Objet : {msg.subject}</div>}
                          <div className="text-muted-foreground whitespace-pre-wrap">{msg.body}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TIMELINE DES AGENTS */}
      <div className="relative pl-6 flex flex-col gap-8 border-l-2 border-muted ml-6">
        {steps.map((step, index) => (
          <div key={index} className="relative">
            {/* Ligne pointillée et connecteur */}
            <div className="absolute -left-[35px] top-6 w-6 h-6 rounded-full bg-background border-2 border-primary flex items-center justify-center z-10">
              <span className="text-xs font-bold text-primary">{index + 1}</span>
            </div>

            <div className="bg-card border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Bot className="w-5 h-5 text-purple-500" />
                    Agent : {step.agentType}
                  </h3>
                  {step.delayHours > 0 && (
                    <Badge variant="outline" className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      Attente {step.delayHours}h
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500" onClick={() => {
                  setSteps(steps.filter((_, i) => i !== index))
                }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid gap-4">
                {index > 0 && (
                  <div className="flex items-center gap-3">
                    <Label className="w-[120px]">Délai (heures)</Label>
                    <Input 
                      type="number" 
                      className="w-[100px]" 
                      value={step.delayHours} 
                      onChange={(e) => {
                        const newSteps = steps.map((s, i) => i === index ? { ...s, delayHours: parseInt(e.target.value) || 0 } : s);
                        setSteps(newSteps);
                      }} 
                    />
                  </div>
                )}
                

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <Label>Instruction Spécifique pour cette étape</Label>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={saveSequence} 
                      disabled={saving}
                      className="h-7 text-xs"
                    >
                      {saving ? "Sauvegarde..." : "Enregistrer ce prompt"}
                    </Button>
                  </div>
                  <Textarea 
                    className="min-h-[100px]"
                    value={step.aiPrompt || ''}
                    onChange={(e) => {
                      const newSteps = steps.map((s, i) => i === index ? { ...s, aiPrompt: e.target.value } : s);
                      setSteps(newSteps);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Cet agent a accès aux informations du prospect et {index > 0 ? "aux emails générés par les agents précédents" : "au contexte global"}.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center mt-4">
        <Button variant="outline" className="border-dashed" onClick={() => {
          setSteps([...steps, { stepOrder: steps.length + 1, agentType: "FOLLOW_UP", templateType: "AI_GENERATED", delayHours: 48, aiPrompt: "" }])
        }}>
          <Plus className="w-4 h-4 mr-2" /> Ajouter un Agent / Étape
        </Button>
      </div>

      {/* DIALOG: ÉDITION MANUELLE */}
      <Dialog open={!!editingMsg} onOpenChange={(open) => !open && setEditingMsg(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Modifier l'email</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <Label>Objet de l'email</Label>
              <Input 
                value={editingMsg?.subject || ""} 
                onChange={(e) => setEditingMsg({...editingMsg, subject: e.target.value})}
                placeholder="Objet de l'email"
              />
            </div>
            <div className="space-y-2">
              <Label>Corps de l'email</Label>
              <Textarea 
                value={editingMsg?.body || ""} 
                onChange={(e) => setEditingMsg({...editingMsg, body: e.target.value})}
                className="min-h-[250px] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMsg(null)}>Annuler</Button>
            <Button onClick={handleSaveManualEdit}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: RÉÉCRITURE IA */}
      <Dialog open={!!aiRewritingMsg} onOpenChange={(open) => !open && !isAiWorking && setAiRewritingMsg(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Demander à l'IA de réécrire
            </DialogTitle>
            <DialogDescription>
              Donnez une instruction à l'IA pour modifier cet email spécifique (ex: "Rends-le plus court", "Ajoute un post-scriptum drôle").
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <Textarea 
              value={aiInstruction} 
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder="Votre instruction pour l'IA..."
              className="min-h-[100px]"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiRewritingMsg(null)} disabled={isAiWorking}>Annuler</Button>
            <Button onClick={handleAiRewrite} disabled={!aiInstruction.trim() || isAiWorking} className="bg-purple-600 hover:bg-purple-700 text-white">
              {isAiWorking ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Génération...</> : <><Sparkles className="w-4 h-4 mr-2" /> Réécrire</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: ENREGISTRER TEMPLATE */}
      <Dialog open={saveTemplateDialogOpen} onOpenChange={setSaveTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer comme modèle</DialogTitle>
            <DialogDescription>
              Sauvegardez vos prompts actuels pour les réutiliser facilement dans de futures campagnes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <Label>Nom du modèle</Label>
              <Input placeholder="Ex: Séquence Agence Web" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Brève description..." value={newTemplateDesc} onChange={(e) => setNewTemplateDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveTemplate} disabled={!newTemplateName || savingTemplate}>
              {savingTemplate ? "Sauvegarde..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
