"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Check, Loader2 } from "lucide-react"

interface AddToListDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedIds: string[]
  onSuccess: () => void
}

export function AddToListDialog({ isOpen, onClose, selectedIds, onSuccess }: AddToListDialogProps) {
  const [lists, setLists] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newListName, setNewListName] = useState("")

  useEffect(() => {
    if (isOpen) {
      fetchLists()
      setSelectedListId(null)
      setIsCreatingNew(false)
      setNewListName("")
    }
  }, [isOpen])

  const fetchLists = async () => {
    setIsLoading(true)
    try {
      const data = await api.get('/lists')
      setLists(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!selectedListId && !isCreatingNew) return
    if (isCreatingNew && !newListName.trim()) return

    setIsSubmitting(true)
    try {
      let targetListId = selectedListId

      // 1. Create list if needed
      if (isCreatingNew) {
        const newList = await api.post('/lists', { name: newListName.trim() })
        targetListId = newList.id
      }

      // 2. Add prospects to list
      if (targetListId) {
        await api.post(`/lists/${targetListId}/prospects`, {
          prospectIds: selectedIds
        })
        onSuccess()
        onClose()
      }
    } catch (error) {
      console.error("Erreur lors de l'ajout", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Ajouter à une liste</DialogTitle>
          <DialogDescription>
            Choisissez une liste existante ou créez-en une nouvelle pour ces {selectedIds.length} prospect(s).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {!isCreatingNew ? (
            <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto p-1">
              {isLoading ? (
                <div className="flex items-center justify-center p-4 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Chargement des listes...
                </div>
              ) : lists.length > 0 ? (
                lists.map((list) => (
                  <div
                    key={list.id}
                    onClick={() => setSelectedListId(list.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedListId === list.id 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{list.name}</span>
                      <span className="text-xs text-muted-foreground">{list._count?.prospects || 0} prospects</span>
                    </div>
                    {selectedListId === list.id && <Check className="w-4 h-4 text-primary" />}
                  </div>
                ))
              ) : (
                <div className="text-center p-4 text-sm text-muted-foreground border border-dashed rounded-lg">
                  Aucune liste existante.
                </div>
              )}
              
              <Button 
                variant="outline" 
                className="mt-2 w-full border-dashed"
                onClick={() => setIsCreatingNew(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Créer une nouvelle liste
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="space-y-2">
                <Label htmlFor="listName">Nom de la nouvelle liste</Label>
                <Input 
                  id="listName" 
                  value={newListName} 
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="Ex: Campagne Hiver 2026"
                  autoFocus
                />
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="self-start text-xs text-muted-foreground"
                onClick={() => {
                  setIsCreatingNew(false)
                  setSelectedListId(null)
                }}
              >
                ← Retour aux listes existantes
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Annuler</Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isSubmitting || (!isCreatingNew && !selectedListId) || (isCreatingNew && !newListName.trim())}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
