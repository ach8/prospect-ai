"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Mail, Phone, User, Link } from 'lucide-react';
import axios from 'axios';

// API base URL (should be from env in prod)
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface JobData {
  id: string;
  status: JobStatus;
  totalRows: number;
  processedRows: number;
  enrichedRows: number;
  failedRows: number;
}

export default function EnrichmentPage() {
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState({
    findEmail: true,
    findPhone: false,
    findDirectorName: true,
    findLinkedin: false,
  });
  
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Gérer le drag and drop
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv']
    },
    maxFiles: 1
  });

  // Toggle options
  const toggleOption = (key: keyof typeof options) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Upload file to API
  const handleUpload = async () => {
    if (!file) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tenantId', 'tenant-demo'); // Hardcoded pour le test
    formData.append('options', JSON.stringify(options));

    try {
      const response = await axios.post(`${API_URL}/enrichment/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        setJobId(response.data.jobId);
      }
    } catch (error) {
      console.error("Erreur lors de l'upload:", error);
      alert("Erreur de connexion au serveur. Assurez-vous que l'API tourne sur le port 4000.");
    } finally {
      setIsUploading(false);
    }
  };

  // Polling du statut du Job
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (jobId && jobData?.status !== 'COMPLETED' && jobData?.status !== 'FAILED') {
      intervalId = setInterval(async () => {
        try {
          const response = await axios.get(`${API_URL}/enrichment/job/${jobId}`);
          setJobData(response.data);
        } catch (error) {
          console.error("Erreur polling:", error);
        }
      }, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId, jobData?.status]);

  // Calculs pour la UI
  const progress = jobData && jobData.totalRows > 0 
    ? Math.round((jobData.processedRows / jobData.totalRows) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-black text-white p-8 overflow-hidden relative selection:bg-purple-500/30">
      {/* Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/20 blur-[120px] pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
        <header className="mb-12">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-4">
            Enrichissement CSV
          </h1>
          <p className="text-white/60 text-lg">
            Importez votre liste d'entreprises, l'IA se charge de trouver les emails, téléphones et dirigeants manquants.
          </p>
        </header>

        <AnimatePresence mode="wait">
          {!jobId ? (
            <motion.div
              key="upload-phase"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="space-y-8"
            >
              {/* Dropzone */}
              <div 
                {...getRootProps()} 
                className={`
                  border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-300
                  flex flex-col items-center justify-center min-h-[300px]
                  ${isDragActive ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 hover:border-white/20 bg-white/5 backdrop-blur-xl'}
                  ${file ? 'border-green-500/50 bg-green-500/5' : ''}
                `}
              >
                <input {...getInputProps()} />
                
                {file ? (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                      <FileText className="w-10 h-10 text-green-400" />
                    </div>
                    <h3 className="text-xl font-medium text-white mb-2">{file.name}</h3>
                    <p className="text-white/50">{(file.size / 1024 / 1024).toFixed(2)} MB • Fichier prêt</p>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="mt-6 text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      Changer de fichier
                    </button>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                      <UploadCloud className="w-10 h-10 text-white/50" />
                    </div>
                    <h3 className="text-xl font-medium text-white mb-2">
                      Glissez-déposez votre CSV ici
                    </h3>
                    <p className="text-white/50 max-w-sm">
                      Ou cliquez pour parcourir. Assurez-vous d'avoir au moins une colonne "Entreprise" ou "Domaine".
                    </p>
                  </div>
                )}
              </div>

              {/* Options Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <OptionCard 
                  active={options.findEmail} 
                  onClick={() => toggleOption('findEmail')}
                  icon={<Mail className="w-5 h-5" />}
                  title="Trouver l'Email"
                  description="Découverte et vérification SMTP"
                />
                <OptionCard 
                  active={options.findDirectorName} 
                  onClick={() => toggleOption('findDirectorName')}
                  icon={<User className="w-5 h-5" />}
                  title="Trouver le Dirigeant"
                  description="Nom du CEO, Gérant, ou Fondateur"
                />
                <OptionCard 
                  active={options.findPhone} 
                  onClick={() => toggleOption('findPhone')}
                  icon={<Phone className="w-5 h-5" />}
                  title="Trouver le Téléphone"
                  description="Standard de l'entreprise"
                />
                <OptionCard 
                  active={options.findLinkedin} 
                  onClick={() => toggleOption('findLinkedin')}
                  icon={<Link className="w-5 h-5" />}
                  title="Profil LinkedIn"
                  description="URL du décideur ou de l'entreprise"
                />
              </div>

              {/* Action Button */}
              <div className="flex justify-end pt-4">
                <button
                  onClick={handleUpload}
                  disabled={!file || isUploading}
                  className={`
                    px-8 py-4 rounded-full font-medium text-lg flex items-center gap-3 transition-all
                    ${!file || isUploading 
                      ? 'bg-white/10 text-white/40 cursor-not-allowed' 
                      : 'bg-white text-black hover:bg-gray-200 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_40px_rgba(255,255,255,0.3)]'}
                  `}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Lancement en cours...
                    </>
                  ) : (
                    <>Enrichir avec l'IA</>
                  )}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="processing-phase"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white/5 border border-white/10 rounded-3xl p-10 backdrop-blur-xl"
            >
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">
                    {jobData?.status === 'COMPLETED' ? 'Terminé !' : 'Analyse en cours...'}
                  </h2>
                  <p className="text-white/50">
                    L'Agent IA parcourt le web pour chaque ligne de votre fichier.
                  </p>
                </div>
                <div className="text-5xl font-light text-white/90">
                  {progress}%
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-4 bg-white/10 rounded-full overflow-hidden mb-10 relative">
                <motion.div 
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "easeInOut", duration: 0.5 }}
                />
                {jobData?.status !== 'COMPLETED' && progress > 0 && (
                   <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse" />
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-6">
                <StatBox label="Total des lignes" value={jobData?.totalRows || '-'} />
                <StatBox label="Lignes traitées" value={jobData?.processedRows || '0'} color="text-blue-400" />
                <StatBox label="Enrichissements réussis" value={jobData?.enrichedRows || '0'} color="text-green-400" />
              </div>

              {jobData?.status === 'COMPLETED' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-12 flex justify-center"
                >
                  <button
                    onClick={() => { setJobId(null); setFile(null); setJobData(null); }}
                    className="px-8 py-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white font-medium"
                  >
                    Enrichir un autre fichier
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function OptionCard({ active, onClick, icon, title, description }: any) {
  return (
    <div 
      onClick={onClick}
      className={`
        p-6 rounded-2xl cursor-pointer transition-all duration-300 border
        flex items-start gap-4
        ${active 
          ? 'bg-purple-500/10 border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.15)]' 
          : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10'}
      `}
    >
      <div className={`
        p-3 rounded-full transition-colors
        ${active ? 'bg-purple-500 text-white' : 'bg-white/10 text-white/50'}
      `}>
        {icon}
      </div>
      <div>
        <h4 className={`font-medium mb-1 ${active ? 'text-white' : 'text-white/80'}`}>{title}</h4>
        <p className="text-sm text-white/50">{description}</p>
      </div>
      <div className="ml-auto">
        {active ? (
          <CheckCircle2 className="w-6 h-6 text-purple-400" />
        ) : (
          <div className="w-6 h-6 rounded-full border-2 border-white/20" />
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color = "text-white" }: any) {
  return (
    <div className="bg-black/40 border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center">
      <div className={`text-4xl font-light mb-2 ${color}`}>{value}</div>
      <div className="text-white/50 text-sm">{label}</div>
    </div>
  );
}
