"use client"

import * as React from "react"
import {
  Users,
  LayoutDashboard,
  Megaphone,
  Bot,
  BarChart,
  Settings,
  LifeBuoy,
  Send,
  Database,
  Wrench,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

const navMain = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Prospects", url: "/prospects", icon: Users },
  { title: "Campagnes", url: "/campaigns", icon: Megaphone },
  { title: "Enrichissement", url: "/enrichment", icon: Database },
  { title: "Agents IA", url: "/agents", icon: Bot },
  { title: "Outils", url: "/tools", icon: Wrench },
  { title: "Analytics", url: "/analytics", icon: BarChart },
]

const navSecondary = [
  { title: "Paramètres", url: "/settings", icon: Settings },
  { title: "Support", url: "/support", icon: LifeBuoy },
  { title: "Feedback", url: "/feedback", icon: Send },
]

export function AppSidebar() {
  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <div className="flex h-12 items-center px-4">
          <div className="flex items-center gap-2 font-semibold">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <span>ProspectAI</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <div className="px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">Main</div>
          {navMain.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild tooltip={item.title}>
                <a href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <SidebarMenu className="mt-auto">
          <div className="px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">Aide & Paramètres</div>
          {navSecondary.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild size="sm">
                <a href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <div className="p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-semibold text-sm">
            JD
          </div>
          <div className="flex flex-col text-sm">
            <span className="font-medium">John Doe</span>
            <span className="text-xs text-muted-foreground">john@example.com</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
