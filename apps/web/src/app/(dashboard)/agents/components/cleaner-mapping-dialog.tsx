"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Bot, ChevronRight } from "lucide-react"
import axios from 'axios'
import { API_URL, api } from '@/lib/api'

interface CsvPreview {
  headers: string[]
  rows: Record<string, string>[]
  totalRows: number
  allRows: Record<string, string>[]
}

const PROSPECT_FIELDS = [
  { value: 'ignore', label: 'Ignorer cette colonne' },
  { value: 'email', label: 'Email' },
  { value: 'firstName', label: 'Prénom' },
  { value: 'lastName', label: 'Nom' },
  { value: 'companyName', label: 'Nom de l\'entreprise' },
  { value: 'companyDomain', label: 'Site Web / Domaine' },
  { value: 'phone', label: 'Téléphone' },
  { value: 'jobTitle', label: 'Poste / Titre' },
  { value: 'linkedinUrl', label: 'URL LinkedIn' },
  { value: 'location', label: 'Adresse / Ville' },
  { value: 'industry', label: 'Secteur d\'activité' },
  { value: 'customVariable', label: 'Tag / Variable personnalisée...' }
]

export function CleanerMappingDialog({ 
  open, 
  onOpenChange, 
  file, 
  targetAudience,
  onCleanSuccess
}: { 
  open: boolean
  onOpenChange: (open: boolean) => void
  file: File | null
  targetAudience: string
  onCleanSuccess: () => void
}) {
  const [phase, setPhase] = useState<'LOADING' | 'MAPPING' | 'CLEANING'>('LOADING')
  const [previewData, setPreviewData] = useState<CsvPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [customTags, setCustomTags] = useState<Record<string, string>>({})
  const [lists, setLists] = useState<any[]>([])
  const [listId, setListId] = useState<string>("")
  const [isCreatingList, setIsCreatingList] = useState(false)
  const [newListName, setNewListName] = useState('')

  useEffect(() => {
    if (open && file) {
      setPhase('LOADING')
      const formData = new FormData()
      formData.append('file', file)

      axios.post(`${API_URL}/enrichment/preview`, formData)
        .then(response => {
          const data: CsvPreview = response.data
          setPreviewData(data)
          
          // Auto-mapping intelligent
          const newMapping: Record<string, string> = {}
          data.headers.forEach(header => {
            const h = header.toLowerCase().trim()
            if (h.includes('mail')) newMapping[header] = 'email'
            else if (h.includes('entreprise') || h.includes('company') || h.includes('societe') || h.includes('société') || h.includes('organization') || h.includes('organisation') || h.includes('account')) newMapping[header] = 'companyName'
            else if (h.includes('prenom') || h.includes('first')) newMapping[header] = 'firstName'
            else if (h.includes('nom') || h.includes('last')) newMapping[header] = 'lastName'
            else if (h.includes('tel') || h.includes('phone') || h.includes('mobile')) newMapping[header] = 'phone'
            else if (h.includes('site') || h.includes('domain') || h.includes('website') || h.includes('url')) newMapping[header] = 'companyDomain'
            else if (h.includes('poste') || h.includes('job') || h.includes('titre') || h.includes('title')) newMapping[header] = 'jobTitle'
            else if (h.includes('linkedin')) newMapping[header] = 'linkedinUrl'
            else newMapping[header] = 'ignore'
          })
          setMapping(newMapping)
          setPhase('MAPPING')
        })
        .catch(error => {
          console.error("Preview error:", error)
          alert("Erreur lors de la lecture du fichier CSV.")
          onOpenChange(false)
        })

      // Fetch lists
      api.get('/lists').then(data => {
        setLists(Array.isArray(data) ? data : [])
      }).catch(console.error)
    }
  }, [open, file])

  const handleStartCleaning = async () => {
    if (!previewData) return
    setPhase('CLEANING')

    try {
      const finalMapping: Record<string, string> = {}
      for (const [header, mappedValue] of Object.entries(mapping)) {
        if (mappedValue === 'customVariable' && customTags[header]) {
          finalMapping[header] = `custom:${customTags[header].trim()}`
        } else {
          finalMapping[header] = mappedValue
        }
      }

      const response = await axios.post(`${API_URL}/agents/clean-csv`, {
        rows: previewData.allRows,
        mapping: finalMapping,
        targetAudience,
        listId,
        filename: file?.name || 'Nettoyage CSV'
      })

      onCleanSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.message || err.message || "Erreur lors du nettoyage.")
      setPhase('MAPPING')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mappage des données</DialogTitle>
          <DialogDescription>
            Associez vos colonnes pour que l'Agent Nettoyeur comprenne parfaitement le contexte de vos prospects.
          </DialogDescription>
        </DialogHeader>

        {phase === 'LOADING' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-4" />
            <p className="text-muted-foreground">Lecture du fichier CSV...</p>
          </div>
        )}

        {phase === 'CLEANING' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-4" />
            <p className="text-muted-foreground">L'Agent Nettoyeur analyse vos prospects, cela peut prendre un moment...</p>
          </div>
        )}

        {phase === 'MAPPING' && previewData && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted text-muted-foreground">
                  <tr>
                    {previewData.headers.map((header, i) => {
                      const isCustom = mapping[header] === 'customVariable'
                      return (
                      <th key={i} className="px-4 py-4 min-w-[200px] align-top">
                        <div className="mb-2 font-semibold truncate text-foreground">{header}</div>
                        <div className="flex flex-col gap-2">
                          <select 
                            value={mapping[header] || 'ignore'}
                            onChange={(e) => setMapping({...mapping, [header]: e.target.value})}
                            className="w-full bg-background border rounded-md p-2 text-xs outline-none focus:ring-1 focus:ring-purple-500"
                          >
                            {PROSPECT_FIELDS.map(f => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>
                          {isCustom && (
                            <input
                              type="text"
                              placeholder="Nom du tag (ex: ca_2023)"
                              value={customTags[header] || ''}
                              onChange={(e) => setCustomTags({...customTags, [header]: e.target.value})}
                              className="w-full bg-background border border-purple-500/50 rounded-md p-2 text-xs outline-none focus:ring-1 focus:ring-purple-500"
                            />
                          )}
                        </div>
                      </th>
                    )})}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {previewData.rows.map((row, rIndex) => (
                    <tr key={rIndex} className="hover:bg-muted/50 transition-colors">
                      {previewData.headers.map((header, cIndex) => (
                        <td key={cIndex} className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
                          {row[header] || <span className="opacity-30 italic">vide</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Liste de destination (Obligatoire)</label>
                {!isCreatingList && (
                  <button onClick={() => setIsCreatingList(true)} className="text-xs text-purple-600 hover:text-purple-500 font-medium">
                    + Nouvelle liste
                  </button>
                )}
              </div>

              {isCreatingList ? (
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newListName}
                    onChange={e => setNewListName(e.target.value)}
                    placeholder="Nom de la liste..."
                    className="flex-1 bg-background border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500"
                    autoFocus
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && newListName.trim()) {
                        try {
                          const res = await api.post('/lists', { name: newListName.trim() });
                          setLists([...lists, res]);
                          setListId(res.id);
                          setIsCreatingList(false);
                          setNewListName('');
                        } catch (e) { console.error(e); }
                      }
                    }}
                  />
                  <Button 
                    onClick={async () => {
                      if (!newListName.trim()) return;
                      try {
                        const res = await api.post('/lists', { name: newListName.trim() });
                        setLists([...lists, res]);
                        setListId(res.id);
                        setIsCreatingList(false);
                        setNewListName('');
                      } catch (e) { console.error(e); }
                    }}
                    disabled={!newListName.trim()}
                    className="bg-purple-600 hover:bg-purple-700 h-9 px-3"
                  >
                    Créer
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => { setIsCreatingList(false); setNewListName(''); }}
                    className="h-9 px-3"
                  >
                    Annuler
                  </Button>
                </div>
              ) : (
                <select 
                  value={listId} 
                  onChange={e => setListId(e.target.value)}
                  className="w-full bg-background border rounded-md p-2 text-sm outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="" disabled>Sélectionnez une liste où ranger les prospects...</option>
                  {lists.map(list => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={phase === 'CLEANING'}>
            Annuler
          </Button>
          <Button 
            className="bg-purple-600 hover:bg-purple-700 text-white" 
            onClick={handleStartCleaning} 
            disabled={phase !== 'MAPPING' || !listId}
          >
            {phase === 'CLEANING' ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Nettoyage en cours...</>
            ) : (
              <><Bot className="w-4 h-4 mr-2" /> Confirmer et Nettoyer</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
