import { useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sparkles, Loader2 } from "lucide-react"

export function ProspectDetailsSheet({ 
  prospect, 
  isOpen, 
  onClose,
  onUpdate
}: { 
  prospect: any | null, 
  isOpen: boolean, 
  onClose: () => void,
  onUpdate?: (updatedProspect: any) => void
}) {
  const [loading, setLoading] = useState(false)

  if (!prospect) return null;

  const enrichment = prospect.enrichmentData || {};

  const handleEnrich = async () => {
    setLoading(true)
    try {
      const { api } = await import('@/lib/api')
      const response = await api.post(`/agents/enrich/${prospect.id}`)
      
      if (response.success && response.prospect) {
        if (onUpdate) onUpdate(response.prospect)
      } else {
        alert(response.message || "Aucune nouvelle donnée trouvée.")
      }
    } catch (err: any) {
      console.error(err)
      alert("Erreur lors de l'enrichissement.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-6 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-2xl font-bold flex items-center gap-2">
              {prospect.firstName} {prospect.lastName}
            </SheetTitle>
            <div className="flex items-center gap-2">
              {enrichment.leadScore && (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                  Score: {enrichment.leadScore}/100
                </Badge>
              )}
            </div>
          </div>
          <SheetDescription className="text-base mt-2 flex items-center justify-between">
            <span>{prospect.jobTitle} @ <span className="font-semibold text-foreground">{prospect.companyName}</span></span>
            <Button size="sm" variant="secondary" onClick={handleEnrich} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
              {loading ? "Enrichissement..." : "Enrichir avec l'IA"}
            </Button>
          </SheetDescription>
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Contact Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Contact</h3>
            <div className="grid grid-cols-3 gap-y-2 text-sm">
              <span className="text-muted-foreground">Email:</span>
              <span className="col-span-2 font-medium">
                {prospect.email || <span className="italic text-muted-foreground">Non renseigné</span>}
                {prospect.emailVerified && <Badge variant="outline" className="ml-2 text-[10px] text-emerald-500 bg-emerald-500/10 border-emerald-500/20">Vérifié</Badge>}
              </span>
              
              <span className="text-muted-foreground">Téléphone:</span>
              <span className="col-span-2 font-medium">{prospect.phone || '-'}</span>
              
              <span className="text-muted-foreground">LinkedIn:</span>
              <span className="col-span-2 font-medium">{prospect.linkedinUrl ? <a href={prospect.linkedinUrl} target="_blank" className="text-blue-500 hover:underline">Voir le profil</a> : '-'}</span>
            </div>
          </div>

          {/* Company Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Entreprise</h3>
            <div className="grid grid-cols-3 gap-y-2 text-sm">
              <span className="text-muted-foreground">Domaine:</span>
              <span className="col-span-2 font-medium">{prospect.companyDomain || '-'}</span>
              
              <span className="text-muted-foreground">Taille:</span>
              <span className="col-span-2 font-medium">{enrichment.employeeCount || '-'}</span>
              
              <span className="text-muted-foreground">Secteur:</span>
              <span className="col-span-2 font-medium">{prospect.industry || '-'}</span>
            </div>
            {enrichment.companyDescription && (
              <div className="p-3 bg-muted rounded-md text-sm mt-2 italic text-muted-foreground border-l-2 border-primary">
                "{enrichment.companyDescription}"
              </div>
            )}
          </div>

          {/* AI Enrichment Data */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Enrichissement IA</h3>
            <div className="grid grid-cols-3 gap-y-2 text-sm">
              <span className="text-muted-foreground">Source:</span>
              <span className="col-span-2">
                <Badge variant="outline" className="uppercase text-[10px]">{prospect.source}</Badge>
              </span>
              
              <span className="text-muted-foreground">Département:</span>
              <span className="col-span-2 font-medium">{enrichment.department || '-'}</span>
              
              <span className="text-muted-foreground">Niveau:</span>
              <span className="col-span-2 font-medium">{enrichment.seniorityLevel || '-'}</span>
            </div>
            {enrichment.bio && (
              <div className="mt-2">
                <span className="text-xs text-muted-foreground block mb-1">Bio extraite:</span>
                <p className="text-sm bg-muted/50 p-2 rounded-md">{enrichment.bio}</p>
              </div>
            )}
          </div>

          {/* Tags */}
          {enrichment.tags && enrichment.tags.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {enrichment.tags.map((tag: string, i: number) => (
                  <Badge key={i} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
