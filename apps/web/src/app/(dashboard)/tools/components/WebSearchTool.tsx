"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Search } from "lucide-react";

export default function WebSearchTool() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    setError("");
    setResult("");

    try {
      const response = await api.post("/agents/manual", {
        query,
        tools: ["WEB_SEARCH"],
      });

      if (response.success && response.results?.webSearch) {
        setResult(response.results.webSearch);
      } else {
        setError(response.results?.WEB_SEARCH_error || "Aucun résultat.");
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recherche IA sur le Web</CardTitle>
        <CardDescription>
          Posez une question, l'agent naviguera sur le web pour vous faire une synthèse (Grounding with Google Search).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input 
            placeholder="Ex: Qui sont les concurrents de..." 
            value={query} 
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Chercher
          </Button>
        </div>

        {error && <div className="text-sm text-red-500">{error}</div>}

        {result && (
          <div className="mt-6 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border whitespace-pre-wrap text-sm leading-relaxed">
            {result}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
