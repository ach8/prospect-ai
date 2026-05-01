export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left pane - branding */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-zinc-950 text-zinc-50 relative overflow-hidden">
        {/* Background glow effect */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl opacity-50" />
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
             {/* Logo placeholder */}
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
          </div>
          <span className="text-xl font-bold">ProspectAI</span>
        </div>

        <div className="relative z-10 space-y-6 max-w-md">
          <h1 className="text-4xl font-bold tracking-tight">Générez des leads qualifiés en pilote automatique.</h1>
          <p className="text-zinc-400 text-lg">
            Notre système multi-agents alimenté par Gemini découvre, enrichit et contacte vos futurs clients.
          </p>
        </div>

        <div className="relative z-10 text-sm text-zinc-500">
          © {new Date().getFullYear()} ProspectAI. Tous droits réservés.
        </div>
      </div>

      {/* Right pane - forms */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          {children}
        </div>
      </div>
    </div>
  )
}
