import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { List, FolderPlus, MoreVertical, Edit2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function FolderSidebar({ onSelectFolder }: { onSelectFolder?: (id: string | null) => void }) {
  const [lists, setLists] = useState<any[]>([])
  const [newListName, setNewListName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [activeListId, setActiveListId] = useState<string | null>(null)

  const fetchLists = async () => {
    try {
      const data = await api.get('/lists')
      setLists(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchLists()
  }, [])

  const handleCreateList = async () => {
    if (!newListName.trim()) return
    try {
      await api.post('/lists', { name: newListName })
      setNewListName("")
      setIsCreating(false)
      fetchLists()
    } catch (err) {
      console.error(err)
    }
  }

  const handleSelect = (id: string | null) => {
    setActiveListId(id)
    if (onSelectFolder) onSelectFolder(id) // On garde le nom de la prop pour ne pas casser page.tsx
  }

  const handleDeleteList = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer la liste "${name}" ? Les prospects à l'intérieur ne seront PAS supprimés.`)) {
      try {
        await api.delete(`/lists/${id}`)
        if (activeListId === id) {
          handleSelect(null)
        }
        fetchLists()
      } catch (err) {
        console.error(err)
        alert("Erreur lors de la suppression de la liste.")
      }
    }
  }

  return (
    <div className="w-64 border-r pr-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Listes</h2>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCreating(!isCreating)}>
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      {isCreating && (
        <div className="flex items-center gap-2">
          <Input 
            size={1} 
            className="h-8 text-xs" 
            placeholder="Nom de la liste..." 
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
            autoFocus
          />
          <Button size="sm" className="h-8 px-2" onClick={handleCreateList}>Ok</Button>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Button 
          variant={activeListId === null ? "secondary" : "ghost"} 
          className="justify-start h-8 px-2 text-sm font-normal"
          onClick={() => handleSelect(null)}
        >
          Tous les prospects
        </Button>
        {lists.map(list => (
          <Button 
            key={list.id} 
            variant={activeListId === list.id ? "secondary" : "ghost"} 
            className="justify-start h-8 px-2 text-sm font-normal flex items-center justify-between group"
            onClick={() => handleSelect(list.id)}
          >
            <div className="flex items-center gap-2 truncate">
              <List className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{list.name}</span>
            </div>
            <div 
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/20 text-red-400"
              onClick={(e) => handleDeleteList(e, list.id, list.name)}
            >
              <Trash2 className="h-3 w-3" />
            </div>
          </Button>
        ))}
      </div>
    </div>
  )
}
