"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { DataTable } from "@/components/ui/data-table"
import { AiResearchDialog } from "./components/ai-research-dialog"
import { ManualResearchDialog } from "./components/manual-research-dialog"
import { Badge } from "@/components/ui/badge"
import { ProspectDetailsSheet } from "./components/prospect-details-sheet"

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<any[]>([])
  const [selectedProspect, setSelectedProspect] = useState<any | null>(null)

  const fetchProspects = async () => {
    try {
      const data = await api.get('/prospects')
      setProspects(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchProspects()
  }, [])

  const columns = [
    {
      accessorKey: "firstName",
      header: "Nom",
      cell: ({ row }: any) => <div className="font-medium">{row.original.firstName} {row.original.lastName}</div>
    },
    {
      accessorKey: "companyName",
      header: "Entreprise",
    },
    {
      accessorKey: "jobTitle",
      header: "Poste",
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }: any) => {
        const source = row.getValue("source");
        if (!source || source === "MANUAL") return <span className="text-muted-foreground text-xs italic">Manuel</span>;
        return <Badge variant="outline" className="text-[10px] uppercase">{source.replace('_', ' ')}</Badge>;
      }
    },
    {
      accessorKey: "enrichmentData",
      header: "Score",
      cell: ({ row }: any) => {
        const enrichment = row.getValue("enrichmentData");
        const score = enrichment?.leadScore;
        if (!score) return <span className="text-muted-foreground text-xs">-</span>;
        
        let colorClass = "text-red-500 bg-red-500/10 border-red-500/20";
        if (score >= 70) colorClass = "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
        else if (score >= 40) colorClass = "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
        
        return <Badge variant="outline" className={`${colorClass} text-[10px]`}>{score}/100</Badge>;
      }
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }: any) => {
        const email = row.getValue("email")
        if (!email) return <span className="text-muted-foreground italic">Non renseigné</span>
        return (
          <div className="flex items-center gap-2">
            <span>{email}</span>
            {row.original.emailVerified ? (
               <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/10">Vérifié</Badge>
            ) : null}
          </div>
        )
      }
    },
  ]

  return (
    <div className="flex flex-col gap-8 w-full max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vos Prospects</h1>
          <p className="text-muted-foreground mt-1">Gérez et enrichissez votre base de contacts.</p>
        </div>
        <div className="flex items-center gap-2">
          <ManualResearchDialog onComplete={fetchProspects} />
          <AiResearchDialog onComplete={fetchProspects} />
        </div>
      </div>

      <DataTable columns={columns} data={prospects} onRowClick={(row) => setSelectedProspect(row)} />
      
      <ProspectDetailsSheet 
        prospect={selectedProspect} 
        isOpen={!!selectedProspect} 
        onClose={() => setSelectedProspect(null)} 
        onUpdate={(updatedProspect) => {
          setSelectedProspect(updatedProspect)
          fetchProspects()
        }}
      />
    </div>
  )
}
