"use client";

import { useState, useEffect } from "react";
import { api, API_URL } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, PlayCircle, RefreshCw, CheckCircle, XCircle, Search, Mail, Database, StopCircle, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [isStoppingAll, setIsStoppingAll] = useState(false);

  const isProcessing = jobs.some(j => j.status === 'PROCESSING');

  const handleStopAll = async () => {
    if (!confirm("Voulez-vous vraiment arrêter TOUTES les tâches en cours ?")) return;
    setIsStoppingAll(true);
    try {
      await api.post('/jobs/cancel-all');
      alert("Toutes les tâches en cours ont été arrêtées.");
      fetchJobs();
    } catch (error) {
      console.error(error);
      alert("Erreur lors de l'arrêt des tâches.");
    } finally {
      setIsStoppingAll(false);
    }
  };

  const fetchJobs = async () => {
    try {
      const data = await api.get('/jobs');
      setJobs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000); // Polling every 5s
    return () => clearInterval(interval);
  }, []);

  const getJobTypeLabel = (type: string) => {
    switch(type) {
      case 'ENRICHMENT': return <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">Enrichissement IA</Badge>;
      case 'CLEANER': return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">Nettoyage IA</Badge>;
      case 'SOURCING': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Agent Sourcing</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'PENDING': return <Badge variant="secondary" className="bg-white/10">En attente</Badge>;
      case 'PROCESSING': return <Badge variant="default" className="bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/50 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> En cours</Badge>;
      case 'COMPLETED': return <Badge variant="default" className="bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/50">Terminé</Badge>;
      case 'FAILED': return <Badge variant="destructive">Échoué / Arrêté</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const downloadCsv = (jobId: string, jobType: string) => {
    if (jobType === 'SOURCING') {
      window.open(`${API_URL}/agents/research/${jobId}/export`, '_blank');
    } else {
      window.open(`${API_URL}/enrichment/job/${jobId}/export`, '_blank');
    }
  };

  const cancelJob = async (jobId: string) => {
    if (!confirm("Voulez-vous vraiment arrêter cette tâche ?")) return;
    try {
      setActionLoading(`cancel-${jobId}`);
      await api.post(`/jobs/${jobId}/cancel`);
      alert("Tâche arrêtée avec succès.");
      fetchJobs();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'arrêt de la tâche.");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette tâche de l'historique ?")) return;
    try {
      setActionLoading(`delete-${jobId}`);
      await api.delete(`/jobs/${jobId}`);
      alert("Tâche supprimée avec succès.");
      fetchJobs();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la suppression de la tâche.");
    } finally {
      setActionLoading(null);
    }
  };

  const openJobDetails = async (jobId: string) => {
    setSelectedJobId(jobId);
    setDetailsLoading(true);
    try {
      const data = await api.get(`/jobs/${jobId}`);
      setJobDetails(data);
    } catch (error) {
      console.error(error);
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">Tâches en arrière-plan</h1>
          <p className="text-muted-foreground mt-2">Suivez l'avancement de vos imports, nettoyages et enrichissements.</p>
        </div>
        <div className="flex items-center gap-3">
          {isProcessing && (
            <Button variant="outline" size="sm" onClick={handleStopAll} disabled={isStoppingAll} className="flex items-center gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10">
              {isStoppingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
              Arrêter tout
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loading} className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Rafraîchir
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-xl overflow-x-auto shadow-sm">
        {loading && jobs.length === 0 ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Type</TableHead>
                <TableHead>Fichier / Nom</TableHead>
                <TableHead>Liste Cible</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Avancement</TableHead>
                <TableHead>Créé il y a</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const progress = job.totalRows > 0 ? Math.round((job.processedRows / job.totalRows) * 100) : 0;
                const isProcessing = job.status === 'PROCESSING' || job.status === 'PENDING';
                
                return (
                  <TableRow key={job.id} className="cursor-pointer hover:bg-white/5" onClick={() => openJobDetails(job.id)}>
                    <TableCell>{getJobTypeLabel(job.jobType)}</TableCell>
                    <TableCell className="font-medium">{job.filename}</TableCell>
                    <TableCell>
                      {job.list ? (
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-purple-500" />
                          {job.list.name}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell className="w-[300px]">
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{job.processedRows} / {job.totalRows}</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full ${job.status === 'COMPLETED' ? 'bg-green-500' : job.status === 'FAILED' ? 'bg-red-500' : 'bg-purple-500'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                        {(job.jobType === 'ENRICHMENT' || job.jobType === 'SOURCING') && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20 px-1.5 py-0 flex items-center gap-1 font-normal" title="Emails trouvés au total">
                              <CheckCircle className="w-3 h-3"/> {job.enrichedRows} Trouvés
                            </Badge>
                            <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20 px-1.5 py-0 flex items-center gap-1 font-normal" title="Emails non trouvés (échoués)">
                              <XCircle className="w-3 h-3"/> {job.emailsNotFound} Introuvables
                            </Badge>
                            {job.jobType === 'ENRICHMENT' && (
                              <>
                                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20 px-1.5 py-0 flex items-center gap-1 font-normal" title="Trouvés via Google/Gemini OSINT">
                                  <Search className="w-3 h-3"/> {job.emailsFoundSearch} OSINT
                                </Badge>
                                <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/20 px-1.5 py-0 flex items-center gap-1 font-normal" title="Trouvés via Anymail Finder">
                                  <Mail className="w-3 h-3"/> {job.emailsFoundAnymail} Anymail
                                </Badge>
                                <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-400 border-yellow-500/20 px-1.5 py-0 flex items-center gap-1 font-normal" title="Trouvés dans le cache de la base de données">
                                  <Database className="w-3 h-3"/> {job.emailsFoundDatabase} Cache BDD
                                </Badge>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true, locale: fr })}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {(job.status === 'PROCESSING' || job.status === 'PENDING') && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-orange-400 hover:text-orange-300 hover:bg-orange-400/10"
                            disabled={actionLoading === `cancel-${job.id}`}
                            onClick={() => cancelJob(job.id)}
                            title="Arrêter cette tâche"
                          >
                            {actionLoading === `cancel-${job.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          disabled={job.status !== 'COMPLETED' || job.enrichedRows === 0}
                          onClick={() => downloadCsv(job.id, job.jobType)}
                          title="Télécharger les résultats"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                          disabled={actionLoading === `delete-${job.id}`}
                          onClick={() => deleteJob(job.id)}
                          title="Supprimer la tâche"
                        >
                          {actionLoading === `delete-${job.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Aucune tâche en cours ou terminée.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!selectedJobId} onOpenChange={(open) => { if (!open) { setSelectedJobId(null); setJobDetails(null); } }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails de la tâche {jobDetails ? `« ${jobDetails.filename} »` : ''}</DialogTitle>
            <DialogDescription>Aperçu des derniers prospects traités par cette tâche.</DialogDescription>
          </DialogHeader>

          {detailsLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : jobDetails ? (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-secondary/50 rounded-xl border">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Status</div>
                  {getStatusBadge(jobDetails.status)}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Type</div>
                  {getJobTypeLabel(jobDetails.jobType)}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Lignes traitées</div>
                  <div className="font-semibold">{jobDetails.processedRows} / {jobDetails.totalRows}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Emails trouvés</div>
                  <div className="font-semibold text-green-400">{jobDetails.enrichedRows}</div>
                </div>
              </div>

              {jobDetails.prospects && jobDetails.prospects.length > 0 ? (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Entreprise</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Confiance</TableHead>
                        <TableHead>LinkedIn</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobDetails.prospects.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.firstName} {p.lastName}</TableCell>
                          <TableCell>{p.companyName}</TableCell>
                          <TableCell>
                            {p.email ? (
                              <span className="text-green-400">{p.email}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">Introuvable</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.emailConfidence > 0 ? (
                              <Badge variant={p.emailConfidence >= 90 ? 'default' : 'secondary'} className={p.emailConfidence >= 90 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}>
                                {p.emailConfidence}%
                              </Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            {p.linkedinUrl ? <span className="text-blue-400 text-xs">Oui</span> : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground border border-dashed rounded-lg">
                  Aucun prospect n'a encore été généré par cette tâche.
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
