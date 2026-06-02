"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, ListPlus, X } from "lucide-react"
import { AddToListDialog } from "./add-to-list-dialog"

interface BulkActionsBarProps {
  selectedCount: number
  selectedIds: string[]
  onClearSelection: () => void
  onSuccess: () => void
}

export function BulkActionsBar({ selectedCount, selectedIds, onClearSelection, onSuccess }: BulkActionsBarProps) {
  const [isAddToListOpen, setIsAddToListOpen] = useState(false)

  if (selectedCount === 0) return null

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-primary text-primary-foreground px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-300">
        <span className="font-semibold text-sm">
          {selectedCount} prospect{selectedCount > 1 ? "s" : ""} sélectionné{selectedCount > 1 ? "s" : ""}
        </span>
        
        <div className="w-px h-6 bg-primary-foreground/20" />
        
        <div className="flex items-center gap-2">
          <Button 
            variant="destructive" 
            size="sm" 
            className="h-8 rounded-full text-xs font-medium bg-red-500/20 text-red-100 hover:bg-red-500/30 border-none"
            onClick={async () => {
              if (window.confirm(`Êtes-vous sûr de vouloir supprimer ces ${selectedCount} prospects ?`)) {
                try {
                  const { api } = await import('@/lib/api');
                  await api.delete('/prospects', { body: JSON.stringify({ ids: selectedIds }) });
                  onSuccess();
                  onClearSelection();
                } catch (err) {
                  console.error(err);
                  alert("Erreur lors de la suppression");
                }
              }
            }}
          >
            <X className="w-3.5 h-3.5 mr-1.5" />
            Supprimer
          </Button>

          <Button 
            variant="secondary" 
            size="sm" 
            className="h-8 rounded-full text-xs font-medium"
            onClick={() => setIsAddToListOpen(true)}
          >
            <ListPlus className="w-3.5 h-3.5 mr-1.5" />
            Ajouter à une liste
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 rounded-full hover:bg-primary-foreground/10 hover:text-primary-foreground"
            onClick={onClearSelection}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <AddToListDialog 
        isOpen={isAddToListOpen} 
        onClose={() => setIsAddToListOpen(false)} 
        selectedIds={selectedIds}
        onSuccess={() => {
          onSuccess()
          onClearSelection()
        }}
      />
    </>
  )
}
