"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Mail, Search, Building } from "lucide-react";
import EmailDiscoveryTool from "./components/EmailDiscoveryTool";
import GooglePlacesTool from "./components/GooglePlacesTool";
import WebSearchTool from "./components/WebSearchTool";
import CompanyEnricherTool from "./components/CompanyEnricherTool";

export default function ToolsPage() {
  return (
    <div className="p-6 md:p-8 w-full max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Outils d'Enrichissement</h1>
        <p className="text-muted-foreground">
          Utilisez les outils d'intelligence artificielle manuellement et ajoutez les résultats à vos prospects.
        </p>
      </div>

      <Tabs defaultValue="google_places" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="google_places" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Google Places</span>
          </TabsTrigger>
          <TabsTrigger value="email_discovery" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Recherche Email</span>
          </TabsTrigger>
          <TabsTrigger value="company_enricher" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            <span className="hidden sm:inline">Enrichir Entreprise</span>
          </TabsTrigger>
          <TabsTrigger value="web_search" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Web Search IA</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="google_places">
          <GooglePlacesTool />
        </TabsContent>
        <TabsContent value="email_discovery">
          <EmailDiscoveryTool />
        </TabsContent>
        <TabsContent value="company_enricher">
          <CompanyEnricherTool />
        </TabsContent>
        <TabsContent value="web_search">
          <WebSearchTool />
        </TabsContent>
      </Tabs>
    </div>
  );
}
