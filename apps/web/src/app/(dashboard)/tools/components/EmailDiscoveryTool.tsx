"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, CheckCircle2 } from "lucide-react";

export default function EmailDiscoveryTool() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);

  const handleSearch = async () => {
    if (!firstName || !lastName || !domain) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    setAdded(false);

    try {
      const response = await api.post("/agents/manual", {
        query: "Email discovery",
        tools: ["EMAIL_DISCOVERY"],
        firstName,
        lastName,
        domain
      });

      if (response.success && response.results?.emailDiscovery) {
        setResult(response.results.emailDiscovery);
      } else if (response.results?.EMAIL_DISCOVERY_error) {
        setError(response.results.EMAIL_DISCOVERY_error);
      } else {
        setError("Aucun email trouvé pour cette personne sur ce domaine.");
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToProspects = async () => {
    if (!result || !result.email) return;
    setLoading(true);
    try {
      await api.post("/prospects", {
        firstName,
        lastName,
        companyName: domain.split('.')[0],
        companyDomain: domain,
        email: result.email,
        jobTitle: "Contact",
        status: "NEW",
        source: "Manual Tool"
      });
      setAdded(true);
    } catch (err: any) {
      setError(err.message || "Impossible d'ajouter le prospect.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Découverte d'Email</CardTitle>
        <CardDescription>
          Trouvez l'adresse email professionnelle d'un prospect en utilisant notre moteur de vérification temps réel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Prénom</Label>
            <Input id="firstName" placeholder="Jean" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Nom</Label>
            <Input id="lastName" placeholder="Dupont" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain">Domaine (Site Web)</Label>
            <Input id="domain" placeholder="entreprise.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
        </div>

        <Button onClick={handleSearch} disabled={loading} className="w-full md:w-auto">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Rechercher l'Email
        </Button>

        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/10 rounded-md">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Email trouvé :</p>
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold">{result.email}</span>
                  <Badge variant={result.confidence > 80 ? "default" : "secondary"}>
                    {result.confidence}% Confiance
                  </Badge>
                  {result.isCatchAll && <Badge variant="outline">Catch-All</Badge>}
                </div>
              </div>
              <Button 
                variant={added ? "secondary" : "default"} 
                onClick={handleAddToProspects} 
                disabled={loading || added}
              >
                {added ? (
                  <><CheckCircle2 className="mr-2 h-4 w-4" /> Ajouté</>
                ) : (
                  <><UserPlus className="mr-2 h-4 w-4" /> Créer Prospect</>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
