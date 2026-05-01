"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Search, MapPin, Globe, Phone, UserPlus, CheckCircle2 } from "lucide-react";

export default function GooglePlacesTool() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    setError("");
    setResults([]);

    try {
      const response = await api.post("/agents/manual", {
        query,
        tools: ["GOOGLE_PLACES"],
      });

      if (response.success && response.results?.googlePlaces) {
        setResults(response.results.googlePlaces);
      } else {
        setError(response.results?.GOOGLE_PLACES_error || "Aucun résultat trouvé.");
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (place: any, index: number) => {
    setAddedIds(prev => new Set(prev).add(index.toString() + '_loading'));
    try {
      await api.post("/prospects", {
        companyName: place.name,
        companyDomain: place.website?.replace(/^https?:\/\//, '').split('/')[0] || "",
        firstName: "Inconnu",
        lastName: "Inconnu",
        jobTitle: "Dirigeant",
        email: "inconnu@inconnu.com",
        status: "NEW",
        source: "Google Places Tool",
        enrichmentData: {
          phone: place.formatted_phone_number,
          address: place.formatted_address,
          rating: place.rating,
          googleMapsUrl: place.url
        }
      });
      setAddedIds(prev => {
        const next = new Set(prev);
        next.delete(index.toString() + '_loading');
        next.add(index.toString());
        return next;
      });
    } catch (err: any) {
      setAddedIds(prev => {
        const next = new Set(prev);
        next.delete(index.toString() + '_loading');
        return next;
      });
      alert(err.message || "Impossible d'ajouter.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recherche d'Entreprises (Google Places)</CardTitle>
        <CardDescription>
          Trouvez des entreprises locales et importez-les directement comme prospects.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input 
            placeholder="Ex: Agences immobilières à Lyon..." 
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

        {results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {results.map((place, idx) => {
              const isLoading = addedIds.has(idx.toString() + '_loading');
              const isAdded = addedIds.has(idx.toString());
              return (
                <Card key={idx} className="overflow-hidden border bg-slate-50/50 dark:bg-slate-900/50">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-semibold text-lg line-clamp-1">{place.name}</h3>
                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{place.formatted_address}</span>
                      </div>
                      {place.formatted_phone_number && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 shrink-0" />
                          <span>{place.formatted_phone_number}</span>
                        </div>
                      )}
                      {place.website && (
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 shrink-0" />
                          <a href={place.website} target="_blank" rel="noreferrer" className="text-primary hover:underline line-clamp-1">
                            {place.website}
                          </a>
                        </div>
                      )}
                    </div>
                    <Button 
                      className="w-full mt-2" 
                      variant={isAdded ? "secondary" : "default"}
                      disabled={isLoading || isAdded}
                      onClick={() => handleAdd(place, idx)}
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 
                       isAdded ? <><CheckCircle2 className="mr-2 h-4 w-4" /> Importé</> : 
                       <><UserPlus className="mr-2 h-4 w-4" /> Importer le Prospect</>}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
