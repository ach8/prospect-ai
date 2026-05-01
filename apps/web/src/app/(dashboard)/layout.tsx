"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/auth"
import { DashboardLayout as LayoutWrapper } from "@/components/layout/dashboard-layout"

export default function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Temporarily bypass Auth for rapid testing
    setLoading(false)
    /*
    auth.me()
      .then((user) => {
        if (!user || !user.id) {
          router.push("/login")
        } else {
          setLoading(false)
        }
      })
      .catch(() => {
        router.push("/login")
      })
    */
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
             <div className="w-8 h-8 rounded-full bg-primary animate-ping" />
          </div>
          <p className="text-muted-foreground font-medium">Chargement de votre espace...</p>
        </div>
      </div>
    )
  }

  return <LayoutWrapper>{children}</LayoutWrapper>
}
