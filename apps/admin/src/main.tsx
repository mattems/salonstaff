// Before anything that builds a zod schema.
import "@salonstaff/shared/no-eval";
import { TooltipProvider } from "@salonstaff/ui/components/tooltip";
import { EnvironmentBadge } from "@salonstaff/ui/environment-badge";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "./lib/queries";
import { router } from "./router";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <EnvironmentBadge />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
