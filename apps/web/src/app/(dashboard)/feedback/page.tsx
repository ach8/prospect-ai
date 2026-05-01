export default function FeedbackPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Feedback</h2>
      </div>
      <div className="flex h-[450px] shrink-0 items-center justify-center rounded-md border border-dashed">
        <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
          <h3 className="mt-4 text-lg font-semibold">Bientôt disponible</h3>
          <p className="mb-4 mt-2 text-sm text-muted-foreground">
            Aidez-nous à améliorer le produit en nous donnant votre avis.
          </p>
        </div>
      </div>
    </div>
  );
}
