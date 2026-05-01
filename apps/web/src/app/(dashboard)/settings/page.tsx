export default function SettingsPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Paramètres</h2>
      </div>
      <div className="flex h-[450px] shrink-0 items-center justify-center rounded-md border border-dashed">
        <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
          <h3 className="mt-4 text-lg font-semibold">Bientôt disponible</h3>
          <p className="mb-4 mt-2 text-sm text-muted-foreground">
            La configuration de votre compte et facturation sera accessible ici.
          </p>
        </div>
      </div>
    </div>
  );
}
