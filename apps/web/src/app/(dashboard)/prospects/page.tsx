"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { DataTable } from "@/components/ui/data-table"
import { AiResearchDialog } from "./components/ai-research-dialog"
import { ManualResearchDialog } from "./components/manual-research-dialog"
import { Badge } from "@/components/ui/badge"
import { ProspectDetailsSheet } from "./components/prospect-details-sheet"
import { FolderSidebar } from "./components/folder-sidebar"
import { Checkbox } from "@/components/ui/checkbox"
import { BulkActionsBar } from "./components/bulk-actions-bar"
import { RowSelectionState } from "@tanstack/react-table"

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<any[]>([])
  const [selectedProspect, setSelectedProspect] = useState<any | null>(null)
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const fetchProspects = async (listId?: string | null) => {
    try {
      const url = listId ? `/prospects?listId=${listId}` : '/prospects'
      const data = await api.get(url)
      setProspects(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchProspects(activeListId)
  }, [activeListId])

  const selectedIds = Object.keys(rowSelection)
    .filter(index => rowSelection[index])
    .map(index => prospects[parseInt(index)]?.id)
    .filter(Boolean) as string[]

  const columns = [
    {
      id: "select",
      header: ({ table }: any) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Sélectionner tout"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }: any) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
          aria-label="Sélectionner la ligne"
          className="translate-y-[2px]"
          onClick={(e: any) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "firstName",
      header: "Prospect",
      cell: ({ row }: any) => {
        const initials = `${row.original.firstName?.charAt(0) || ''}${row.original.lastName?.charAt(0) || ''}`.toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
              {initials || '?'}
            </div>
            <div className="flex flex-col">
              <span className="font-medium text-sm flex items-center gap-2">
                {row.original.firstName} {row.original.lastName}
                {row.original.hasGeneratedEmails && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-purple-500 border-purple-500/20 bg-purple-500/10 rounded-sm">Email Généré</Badge>
                )}
              </span>
              {row.original.jobTitle && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={row.original.jobTitle}>
                  {row.original.jobTitle}
                </span>
              )}
            </div>
          </div>
        )
      }
    },
    {
      accessorKey: "companyName",
      header: "Entreprise",
      cell: ({ row }: any) => {
        const domain = row.original.companyDomain;
        return (
          <div className="flex flex-col">
            <span className="font-medium text-sm">{row.original.companyName}</span>
            {domain && (
              <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {domain}
              </a>
            )}
          </div>
        )
      }
    },
    {
      accessorKey: "contact",
      header: "Coordonnées",
      cell: ({ row }: any) => {
        const email = row.original.email;
        const phone = row.original.phone;
        const linkedin = row.original.linkedinUrl;
        const gmaps = row.original.enrichmentData?.googleMapsUrl;
        
        return (
          <div className="flex flex-col gap-1">
            {email ? (
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{email}</span>
                {row.original.emailVerified && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-emerald-500 border-emerald-500/20 bg-emerald-500/10 rounded-sm">Vérifié</Badge>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">Email inconnu</span>
            )}
            
            {(phone || linkedin || gmaps) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                {phone && <span>📞 {phone}</span>}
                {phone && linkedin && <span>•</span>}
                {linkedin && (
                  <a href={linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                    LinkedIn
                  </a>
                )}
                {gmaps && (
                  <>
                    {(phone || linkedin) && <span>•</span>}
                    <a href={gmaps} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      📍 Maps
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        )
      }
    },
    {
      accessorKey: "industry",
      header: "Secteur",
      cell: ({ row }: any) => {
        const industry = row.original.industry;
        if (!industry) return <span className="text-muted-foreground text-xs italic">-</span>;
        return <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{industry}</Badge>;
      }
    },
    {
      accessorKey: "enrichmentData",
      header: "Score",
      cell: ({ row }: any) => {
        const enrichment = row.original.enrichmentData;
        const score = enrichment?.leadScore;
        if (!score) return <span className="text-muted-foreground text-xs">-</span>;
        
        let colorClass = "text-red-500 bg-red-500/10 border-red-500/20";
        if (score >= 70) colorClass = "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
        else if (score >= 40) colorClass = "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
        
        return <Badge variant="outline" className={`${colorClass} text-xs font-semibold`}>{score}/100</Badge>;
      }
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }: any) => {
        const source = row.original.source;
        if (!source || source === "MANUAL") return <span className="text-muted-foreground text-xs italic">Manuel</span>;
        return <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{source.replace('_', ' ')}</Badge>;
      }
    },
  ]

  return (
    <div className="flex gap-6 w-full max-w-[1400px] mx-auto animate-in fade-in duration-500 relative">
      
      {/* Sidebar des dossiers */}
      <div className="hidden md:block shrink-0">
        <FolderSidebar onSelectFolder={setActiveListId} />
      </div>

      {/* Contenu principal */}
      <div className="flex flex-col gap-8 w-full min-w-0">
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

        <DataTable 
          columns={columns} 
          data={prospects} 
          onRowClick={(row) => setSelectedProspect(row)} 
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
        
        <ProspectDetailsSheet 
          prospect={selectedProspect} 
          isOpen={!!selectedProspect} 
          onClose={() => setSelectedProspect(null)} 
          onUpdate={(updatedProspect) => {
            setSelectedProspect(updatedProspect)
            fetchProspects()
          }}
        />

        <BulkActionsBar 
          selectedCount={selectedIds.length}
          selectedIds={selectedIds}
          onClearSelection={() => setRowSelection({})}
          onSuccess={() => {
            fetchProspects(activeListId)
          }}
        />
      </div>
    </div>
  )
}
