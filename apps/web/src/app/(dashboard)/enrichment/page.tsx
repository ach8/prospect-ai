"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Mail, Phone, User, Link, Download, ChevronRight, ChevronLeft } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from 'axios';

import { API_URL, api } from '@/lib/api';

type Phase = 'UPLOAD' | 'MAPPING' | 'ANALYZE' | 'PROCESSING';

interface CsvPreview {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  allRows: Record<string, string>[];
}

interface AnalyzeResult {
  totalRows: number;
  duplicatesCount: number;
  missingEmail: number;
  missingPhone: number;
  missingDirector: number;
  missingWebsite: number;
  missingLinkedin: number;
  suggestedTools: any[];
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
];

export default function EnrichmentPage() {
  const [phase, setPhase] = useState<Phase>('UPLOAD');
  const [uploadSource, setUploadSource] = useState<'csv' | 'list'>('csv');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Mapping State
  const [previewData, setPreviewData] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [customTags, setCustomTags] = useState<Record<string, string>>({});
  
  // Analyze State
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [options, setOptions] = useState({
    findEmail: false,
    findPhone: false,
    findDirectorName: false,
    findLinkedin: false,
  });
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update'>('skip');
  
  // List State
  const [lists, setLists] = useState<any[]>([]);
  const [listId, setListId] = useState<string>('');
  const [selectedListIdForEnrichment, setSelectedListIdForEnrichment] = useState<string>('');
  const [listProspects, setListProspects] = useState<any[]>([]);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Processing State
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<any | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialization from URL
  useEffect(() => {
    const urlJobId = searchParams.get('jobId');
    if (urlJobId) {
      setJobId(urlJobId);
      setPhase('PROCESSING');
      // Remove jobId from url without full reload so it doesn't get stuck if user wants to upload new file later
      router.replace('/enrichment');
    }

    // Fetch lists on load
    api.get('/lists').then(data => {
      setLists(Array.isArray(data) ? data : []);
    }).catch(console.error);
  }, [searchParams, router]);

  // 1. UPLOAD & PREVIEW
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setIsUploading(true);
      
      const formData = new FormData();
      formData.append('file', selectedFile);

      try {
        const response = await axios.post(`${API_URL}/enrichment/preview`, formData);
        const data: CsvPreview = response.data;
        setPreviewData(data);
        
        // Auto-mapping intelligent
        const newMapping: Record<string, string> = {};
        data.headers.forEach(header => {
          // Normalize to remove accents so 'prénom' becomes 'prenom'
          const h = header.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          
          if (h.includes('mail')) newMapping[header] = 'email';
          else if (h.includes('entreprise') || h.includes('company') || h.includes('societe')) newMapping[header] = 'companyName';
          // Make sure 'prenom' is checked BEFORE 'nom'
          else if (h.includes('prenom') || h.includes('first')) newMapping[header] = 'firstName';
          // Check exact match or just includes 'nom' after prenom is checked
          else if (h === 'nom' || h.includes('last') || h.includes('nom')) newMapping[header] = 'lastName';
          else if (h.includes('tel') || h.includes('phone') || h.includes('mobile')) newMapping[header] = 'phone';
          else if (h.includes('site') || h.includes('domain') || h.includes('website') || h.includes('url')) newMapping[header] = 'companyDomain';
          else if (h.includes('poste') || h.includes('job') || h.includes('titre')) newMapping[header] = 'jobTitle';
          else if (h.includes('linkedin')) newMapping[header] = 'linkedinUrl';
          else newMapping[header] = 'ignore';
        });
        setMapping(newMapping);
        setPhase('MAPPING');
      } catch (error) {
        console.error("Preview error:", error);
        alert("Erreur lors de l'analyse du CSV.");
      } finally {
        setIsUploading(false);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv'] },
    maxFiles: 1
  });

  // 2. ANALYZE
  const handleAnalyze = async () => {
    if (!previewData) return;
    setIsUploading(true);
    try {
      // Replace 'customVariable' with 'custom:[tagName]' before sending to backend
      const finalMapping: Record<string, string> = {};
      for (const [header, mappedValue] of Object.entries(mapping)) {
        if (mappedValue === 'customVariable' && customTags[header]) {
          finalMapping[header] = `custom:${customTags[header].trim()}`;
        } else {
          finalMapping[header] = mappedValue;
        }
      }

      const response = await axios.post(`${API_URL}/enrichment/analyze`, {
        rows: previewData.allRows,
        mapping: finalMapping
      });
      const result = response.data;
      setAnalyzeResult(result);
      // Auto-enable options only for fields with missing data
      const autoOptions: any = {
        findEmail: false,
        findPhone: false,
        findDirectorName: false,
        findLinkedin: false,
      };
      for (const tool of result.suggestedTools) {
        if (tool.missing > 0) {
          autoOptions[tool.id] = true;
        }
      }
      setOptions(autoOptions);
      setPhase('ANALYZE');
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalyzeExistingList = async () => {
    if (!selectedListIdForEnrichment) return;
    setIsUploading(true);
    try {
      const prospects = await api.get(`/prospects?listId=${selectedListIdForEnrichment}`);
      if (!Array.isArray(prospects) || prospects.length === 0) {
        alert("Cette liste est vide ou introuvable.");
        return;
      }
      setListProspects(prospects);
      
      let missingEmail = 0;
      let missingPhone = 0;
      let missingDirector = 0;
      let missingWebsite = 0;
      let missingLinkedin = 0;

      prospects.forEach(p => {
        if (!p.email) missingEmail++;
        if (!p.phone) missingPhone++;
        if (!p.firstName && !p.lastName) missingDirector++;
        if (!p.companyDomain) missingWebsite++;
        if (!p.linkedinUrl) missingLinkedin++;
      });

      const suggestedTools = [
        { id: 'findEmail', label: 'Découverte Email vérifié', missing: missingEmail, tools: ['Reacher SMTP'], estimatedTime: missingEmail > 0 ? `~${Math.ceil((missingEmail * 20)/60)} min` : '0 min' },
        { id: 'findDirectorName', label: 'Nom du Dirigeant', missing: missingDirector, tools: ['OpenData', 'Google Search'], estimatedTime: missingDirector > 0 ? `~${Math.ceil((missingDirector * 10)/60)} min` : '0 min' },
        { id: 'findPhone', label: 'Téléphone Entreprise', missing: missingPhone, tools: ['Google Places'], estimatedTime: missingPhone > 0 ? `~${Math.ceil((missingPhone * 5)/60)} min` : '0 min' },
        { id: 'findLinkedin', label: 'Profil LinkedIn', missing: missingLinkedin, tools: ['Web Search'], estimatedTime: missingLinkedin > 0 ? `~${Math.ceil((missingLinkedin * 5)/60)} min` : '0 min' }
      ];

      setAnalyzeResult({
        totalRows: prospects.length,
        duplicatesCount: 0,
        missingEmail,
        missingPhone,
        missingDirector,
        missingWebsite,
        missingLinkedin,
        suggestedTools
      });

      const autoOptions: any = {
        findEmail: false,
        findPhone: false,
        findDirectorName: false,
        findLinkedin: false,
      };
      for (const tool of suggestedTools) {
        if (tool.missing > 0) autoOptions[tool.id] = true;
      }
      setOptions(autoOptions);

      setPhase('ANALYZE');
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'analyse de la liste.");
    } finally {
      setIsUploading(false);
    }
  };

  // 3. START ENRICHMENT
  const handleStart = async () => {
    if (uploadSource === 'list') {
      if (listProspects.length === 0) return;
      setIsUploading(true);
      try {
        const response = await axios.post(`${API_URL}/enrichment/existing`, {
          prospectIds: listProspects.map(p => p.id),
          options
        });
        setJobId(response.data.jobId);
        setPhase('PROCESSING');
      } catch (error) {
        console.error(error);
        alert("Erreur de lancement");
      } finally {
        setIsUploading(false);
      }
      return;
    }

    if (!previewData) return;
    setIsUploading(true);
    try {
      // Replace 'customVariable' with 'custom:[tagName]' before sending to backend
      const finalMapping: Record<string, string> = {};
      for (const [header, mappedValue] of Object.entries(mapping)) {
        if (mappedValue === 'customVariable' && customTags[header]) {
          finalMapping[header] = `custom:${customTags[header].trim()}`;
        } else {
          finalMapping[header] = mappedValue;
        }
      }

      const response = await axios.post(`${API_URL}/enrichment/upload`, {
        rows: previewData.allRows,
        mapping: finalMapping,
        options,
        duplicateAction,
        listId
      });
      setJobId(response.data.jobId);
      setPhase('PROCESSING');
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  // 4. POLLING
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (phase === 'PROCESSING' && jobId && jobData?.status !== 'COMPLETED' && jobData?.status !== 'FAILED') {
      intervalId = setInterval(async () => {
        try {
          const response = await axios.get(`${API_URL}/enrichment/job/${jobId}`);
          setJobData(response.data);
        } catch (error) {
          console.error("Polling error:", error);
        }
      }, 2000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [phase, jobId, jobData?.status]);

  const progress = jobData && jobData.totalRows > 0 
    ? Math.round((jobData.processedRows / jobData.totalRows) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-black text-white p-8 overflow-y-auto relative selection:bg-purple-500/30 pb-24">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/20 blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-4">
            Enrichissement d'Emails CSV
          </h1>
          <div className="flex items-center justify-center gap-4 text-sm text-white/40">
            <span className={phase === 'UPLOAD' ? 'text-white' : ''}>1. Upload</span>
            <ChevronRight className="w-4 h-4" />
            <span className={phase === 'MAPPING' ? 'text-white' : ''}>2. Mapping</span>
            <ChevronRight className="w-4 h-4" />
            <span className={phase === 'ANALYZE' ? 'text-white' : ''}>3. Analyse</span>
            <ChevronRight className="w-4 h-4" />
            <span className={phase === 'PROCESSING' ? 'text-white' : ''}>4. Magie IA</span>
          </div>
        </header>

        <AnimatePresence mode="wait">
          
          {/* PHASE 1 : UPLOAD */}
          {phase === 'UPLOAD' && (
            <motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-8">
              <div className="flex justify-center gap-4 mb-6">
                <button 
                  onClick={() => setUploadSource('csv')}
                  className={`px-6 py-2 rounded-full border transition-all ${uploadSource === 'csv' ? 'bg-purple-600 border-purple-500 text-white' : 'border-white/20 text-white/60 hover:text-white'}`}
                >
                  Importer un fichier CSV
                </button>
                <button 
                  onClick={() => setUploadSource('list')}
                  className={`px-6 py-2 rounded-full border transition-all ${uploadSource === 'list' ? 'bg-purple-600 border-purple-500 text-white' : 'border-white/20 text-white/60 hover:text-white'}`}
                >
                  Utiliser une Liste Existante
                </button>
              </div>

              {uploadSource === 'csv' ? (
                <div 
                  {...getRootProps()} 
                  className={`
                    border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-300
                    flex flex-col items-center justify-center min-h-[400px]
                    ${isDragActive ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 hover:border-white/20 bg-white/5 backdrop-blur-xl'}
                  `}
                >
                  <input {...getInputProps()} />
                  {isUploading ? (
                    <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
                  ) : (
                    <>
                      <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6">
                        <UploadCloud className="w-12 h-12 text-white/50" />
                      </div>
                      <h3 className="text-2xl font-medium text-white mb-2">Glissez-déposez votre CSV ici</h3>
                      <p className="text-white/50 max-w-md mx-auto">
                        Format supporté: .csv (séparateur virgule ou point-virgule). Détection automatique des colonnes.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="border-2 border-dashed border-white/10 rounded-3xl p-12 text-center bg-white/5 backdrop-blur-xl flex flex-col items-center justify-center min-h-[400px]">
                  <h3 className="text-2xl font-medium text-white mb-6">Sélectionnez une liste à enrichir</h3>
                  <p className="text-white/50 max-w-md mx-auto mb-8">
                    Sélectionnez l'une de vos listes existantes. Nous allons analyser les données manquantes de ses prospects.
                  </p>
                  <select 
                    value={selectedListIdForEnrichment}
                    onChange={(e) => setSelectedListIdForEnrichment(e.target.value)}
                    className="w-full max-w-md bg-black/50 border border-white/20 rounded-xl p-4 text-white outline-none focus:border-purple-500 mb-8"
                  >
                    <option value="" disabled className="bg-zinc-900 text-white/50">Choisissez une liste...</option>
                    {lists.map(list => (
                      <option key={list.id} value={list.id} className="bg-zinc-900">
                        {list.name} ({list._count?.prospects || 0} prospects)
                      </option>
                    ))}
                  </select>
                  <button 
                    onClick={handleAnalyzeExistingList}
                    disabled={!selectedListIdForEnrichment || isUploading}
                    className="px-8 py-3 rounded-full bg-purple-600 text-white font-medium hover:bg-purple-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Analyser cette liste'} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* PHASE 2 : MAPPING */}
          {phase === 'MAPPING' && previewData && (
            <motion.div key="mapping" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-md">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-2xl font-semibold mb-1">Associer les colonnes</h3>
                    <p className="text-white/50">Vérifiez que nos correspondances sont correctes pour vos {previewData.totalRows} lignes.</p>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-white/5 text-white/60">
                      <tr>
                        {previewData.headers.map((header, i) => {
                          const isCustom = mapping[header] === 'customVariable';
                          return (
                          <th key={i} className="px-6 py-4 min-w-[200px] align-top">
                            <div className="mb-2 font-semibold text-white/90 truncate">{header}</div>
                            <div className="flex flex-col gap-2">
                              <select 
                                value={mapping[header] || 'ignore'}
                                onChange={(e) => setMapping({...mapping, [header]: e.target.value})}
                                className="w-full bg-black/50 border border-white/20 rounded-lg p-2 text-white text-xs outline-none focus:border-purple-500"
                              >
                                {PROSPECT_FIELDS.map(f => (
                                  <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                              </select>
                              {isCustom && (
                                <input
                                  type="text"
                                  placeholder="Nom de la variable (ex: ca_2023)"
                                  value={customTags[header] || ''}
                                  onChange={(e) => setCustomTags({...customTags, [header]: e.target.value})}
                                  className="w-full bg-black/50 border border-purple-500/50 rounded-lg p-2 text-white text-xs outline-none focus:border-purple-500"
                                />
                              )}
                            </div>
                          </th>
                        )})}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {previewData.rows.map((row, rIndex) => (
                        <tr key={rIndex} className="bg-white/5 hover:bg-white/10 transition-colors">
                          {previewData.headers.map((header, cIndex) => (
                            <td key={cIndex} className="px-6 py-3 text-white/70 truncate max-w-[200px]">
                              {row[header] || <span className="text-white/20 italic">vide</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-8 flex justify-between">
                  <button onClick={() => setPhase('UPLOAD')} className="px-6 py-3 rounded-full border border-white/20 hover:bg-white/5 transition-colors">
                    Annuler
                  </button>
                  <button onClick={handleAnalyze} disabled={isUploading} className="px-8 py-3 rounded-full bg-white text-black font-medium hover:bg-gray-200 transition-colors flex items-center gap-2">
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Analyser les données'} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* PHASE 3 : ANALYZE */}
          {phase === 'ANALYZE' && analyzeResult && (
            <motion.div key="analyze" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
              
              {uploadSource === 'csv' && analyzeResult.duplicatesCount > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-6 flex items-start gap-4">
                  <AlertCircle className="w-6 h-6 text-orange-400 shrink-0 mt-1" />
                  <div className="flex-1">
                    <h4 className="text-lg font-medium text-orange-400 mb-2">Attention : {analyzeResult.duplicatesCount} doublons potentiels détectés</h4>
                    <p className="text-white/70 text-sm mb-4">Ces prospects existent déjà dans votre base (même email ou nom de domaine).</p>
                    <div className="flex gap-4">
                      <label className={`flex items-center gap-2 cursor-pointer p-3 rounded-lg border transition-all ${duplicateAction === 'skip' ? 'border-orange-400 bg-orange-400/10' : 'border-white/10 hover:border-white/30'}`}>
                        <input type="radio" name="dup" checked={duplicateAction === 'skip'} onChange={() => setDuplicateAction('skip')} className="hidden" />
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${duplicateAction === 'skip' ? 'border-orange-400' : 'border-white/30'}`}>
                          {duplicateAction === 'skip' && <div className="w-2 h-2 rounded-full bg-orange-400" />}
                        </div>
                        <span className="text-sm">Ignorer ces lignes</span>
                      </label>
                      <label className={`flex items-center gap-2 cursor-pointer p-3 rounded-lg border transition-all ${duplicateAction === 'update' ? 'border-orange-400 bg-orange-400/10' : 'border-white/10 hover:border-white/30'}`}>
                        <input type="radio" name="dup" checked={duplicateAction === 'update'} onChange={() => setDuplicateAction('update')} className="hidden" />
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${duplicateAction === 'update' ? 'border-orange-400' : 'border-white/30'}`}>
                          {duplicateAction === 'update' && <div className="w-2 h-2 rounded-full bg-orange-400" />}
                        </div>
                        <span className="text-sm">Mettre à jour avec les nouvelles données</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analyzeResult.suggestedTools.map((tool: any) => {
                  const isActive = (options as any)[tool.id];
                  const isNeeded = tool.missing > 0;
                  
                  return (
                    <div 
                      key={tool.id}
                      onClick={() => isNeeded && setOptions({...options, [tool.id]: !isActive})}
                      className={`
                        p-6 rounded-2xl transition-all duration-300 border flex flex-col gap-4
                        ${!isNeeded ? 'opacity-50 cursor-not-allowed bg-white/5 border-white/5' : 
                          isActive ? 'cursor-pointer bg-purple-500/10 border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.15)]' : 
                          'cursor-pointer bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10'}
                      `}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className={`font-medium mb-1 ${isActive ? 'text-white' : 'text-white/80'}`}>{tool.label}</h4>
                          <div className="flex gap-2 mb-2">
                            {tool.tools.map((t: string) => <span key={t} className="text-[10px] uppercase bg-white/10 px-2 py-1 rounded">{t}</span>)}
                          </div>
                        </div>
                        {isActive ? <CheckCircle2 className="w-6 h-6 text-purple-400" /> : <div className="w-6 h-6 rounded-full border-2 border-white/20" />}
                      </div>
                      
                      <div className="mt-auto bg-black/40 rounded-lg p-3 flex justify-between items-center border border-white/5">
                        <span className="text-sm text-white/50">Lignes à enrichir:</span>
                        <span className={`font-semibold ${tool.missing > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                          {tool.missing === 0 ? 'Complet ✅' : tool.missing}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {uploadSource === 'csv' && (
                <div className="pt-4 border-t border-white/10 space-y-2 mt-8">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-white/80">Liste de destination (Obligatoire)</label>
                    {!isCreatingList && (
                      <button onClick={() => setIsCreatingList(true)} className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1">
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
                        className="flex-1 bg-black/50 border border-white/10 rounded-xl p-3 text-sm outline-none focus:ring-1 focus:ring-purple-500 text-white"
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
                      <button 
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
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-colors"
                      >
                        Créer
                      </button>
                      <button 
                        onClick={() => { setIsCreatingList(false); setNewListName(''); }}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <select 
                      value={listId} 
                      onChange={e => setListId(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-sm outline-none focus:ring-1 focus:ring-purple-500 text-white"
                    >
                      <option value="" disabled className="bg-zinc-900 text-white/50">Sélectionnez une liste où ranger les prospects...</option>
                      {lists.map(list => (
                        <option key={list.id} value={list.id} className="bg-zinc-900">{list.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="flex justify-between mt-8">
                <button onClick={() => setPhase(uploadSource === 'list' ? 'UPLOAD' : 'MAPPING')} className="px-6 py-3 rounded-full border border-white/20 hover:bg-white/5 transition-colors">
                  Retour
                </button>
                <button onClick={handleStart} disabled={isUploading || (uploadSource === 'csv' && !listId)} className="px-8 py-3 rounded-full bg-white text-black font-medium hover:bg-gray-200 shadow-[0_0_40px_rgba(255,255,255,0.3)] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Lancer la Magie IA'} 
                </button>
              </div>
            </motion.div>
          )}

          {/* PHASE 4 : PROCESSING (LIVE TABLE) */}
          {phase === 'PROCESSING' && jobData && (
            <motion.div key="processing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
              
              {/* Progress Header */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <h2 className="text-2xl font-semibold mb-2 flex items-center gap-3">
                      {jobData.status === 'COMPLETED' ? (
                        <><CheckCircle2 className="text-green-400" /> Terminé avec succès !</>
                      ) : (
                        <><Loader2 className="animate-spin text-purple-400" /> Enrichissement en cours...</>
                      )}
                    </h2>
                  </div>
                  <div className="text-5xl font-light">{progress}%</div>
                </div>

                <div className="h-3 bg-white/10 rounded-full overflow-hidden mb-8 relative">
                  <motion.div className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-blue-500" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <StatBox label="Total" value={jobData.totalRows} />
                  <StatBox label="Traités" value={jobData.processedRows} color="text-blue-400" />
                  <StatBox label="Succès IA" value={jobData.enrichedRows} color="text-green-400" />
                  <StatBox label="Échecs" value={jobData.failedRows} color="text-red-400" />
                </div>

                {jobData.status === 'COMPLETED' && (
                  <div className="mt-8 pt-8 border-t border-white/10 flex justify-center gap-4">
                    <a href={`${API_URL}/enrichment/job/${jobId}/export`} target="_blank" rel="noreferrer" className="px-6 py-3 rounded-full bg-white text-black font-medium hover:bg-gray-200 transition-colors flex items-center gap-2">
                      <Download className="w-4 h-4" /> Télécharger CSV
                    </a>
                    <button onClick={() => { setPhase('UPLOAD'); setFile(null); setJobId(null); setPreviewData(null); }} className="px-6 py-3 rounded-full border border-white/20 hover:bg-white/5 transition-colors">
                      Nouveau Fichier
                    </button>
                  </div>
                )}
              </div>

              {/* LIVE TABLE */}
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md">
                <div className="p-4 border-b border-white/10 bg-white/5">
                  <h3 className="font-medium text-white/80">Aperçu en direct des résultats ({jobData.prospects?.length || 0})</h3>
                </div>
                <div className="overflow-x-auto max-h-[400px]">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-black/40 text-white/50 sticky top-0 backdrop-blur-md">
                      <tr>
                        <th className="px-4 py-3">Entreprise</th>
                        <th className="px-4 py-3">Nom</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Téléphone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence>
                        {(jobData.prospects || []).map((p: any) => (
                          <motion.tr 
                            key={p.id} 
                            initial={{ opacity: 0, backgroundColor: 'rgba(168,85,247,0.2)' }}
                            animate={{ opacity: 1, backgroundColor: 'rgba(255,255,255,0)' }}
                            className="hover:bg-white/5 transition-colors"
                          >
                            <td className="px-4 py-3 font-medium">{p.companyName || '-'}</td>
                            <td className="px-4 py-3">{p.firstName} {p.lastName}</td>
                            <td className="px-4 py-3">
                              {p.email ? (
                                <span className={`flex items-center gap-2 ${p.emailConfidence >= 80 ? 'text-green-400' : 'text-yellow-400'}`}>
                                  <Mail className="w-3 h-3" /> {p.email}
                                </span>
                              ) : <span className="text-white/20">-</span>}
                            </td>
                            <td className="px-4 py-3">
                              {p.phone ? <span className="text-blue-400">{p.phone}</span> : <span className="text-white/20">-</span>}
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                      {(!jobData.prospects || jobData.prospects.length === 0) && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-white/40 italic">
                            Les résultats apparaîtront ici au fur et à mesure...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

function StatBox({ label, value, color = "text-white" }: any) {
  return (
    <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center">
      <div className={`text-3xl font-light mb-1 ${color}`}>{value}</div>
      <div className="text-white/50 text-xs text-center">{label}</div>
    </div>
  );
}
