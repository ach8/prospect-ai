"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building, Search, UserPlus, CheckCircle2 } from "lucide-react";

export default function CompanyEnricherTool() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);

  const handleSearch = async () => {
    if (!domain) return;
    setLoading(true);
    setError("");
    setResult(null);
    setAdded(false);

    try {
      const response = await api.post("/agents/manual", {
        query: domain,
        tools: ["ENRICHER"],
      });

      if (response.success && response.results?.enricher) {
        setResult(response.results.enricher);
      } else {
        setError(response.results?.ENRICHER_error || "Impossible d'enrichir ce domaine.");
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToProspects = async () => {
    if (!result) return;
    setLoading(true);
    try {
      await api.post("/prospects", {
        companyName: result.name || domain.split('.')[0],
        companyDomain: domain,
        firstName: "Inconnu",
        lastName: "Inconnu",
        jobTitle: "Dirigeant",
        email: "inconnu@inconnu.com",
        status: "NEW",
        source: "Enricher Tool",
        enrichmentData: {
          description: result.description,
          industry: result.industry,
          linkedinUrl: result.linkedinUrl
        }
      });
      setAdded(true);
    } catch (err: any) {
      setError(err.message || "Impossible d'ajouter.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrichissement d'Entreprise</CardTitle>
        <CardDescription>
          Entrez le nom de domaine d'une entreprise pour obtenir un résumé, son secteur et ses liens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input 
            placeholder="Ex: stripe.com" 
            value={domain} 
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Enrichir
          </Button>
        </div>

        {error && <div className="text-sm text-red-500">{error}</div>}

        {result && (
          <div className="mt-6 space-y-4 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Building className="h-5 w-5" />
                {result.name || domain}
              </h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {result.description}
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Secteur:</span> {result.industry || "N/A"}
              </div>
              <div>
                <span className="font-medium">LinkedIn:</span>{" "}
                {result.linkedinUrl ? (
                  <a href={result.linkedinUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    Voir le profil
                  </a>
                ) : "N/A"}
              </div>
            </div>

            <div className="pt-4 flex justify-end border-t">
              <Button 
                variant={added ? "secondary" : "default"} 
                onClick={handleAddToProspects} 
                disabled={loading || added}
              >
                {added ? (
                  <><CheckCircle2 className="mr-2 h-4 w-4" /> Entreprise Ajoutée</>
                ) : (
                  <><UserPlus className="mr-2 h-4 w-4" /> Ajouter aux prospects</>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
