"use client";

import { ReactNode } from "react";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { ThemeProvider } from "@/lib/theme/ThemeContext";
import { MobileNavProvider } from "@/lib/navigation/MobileNavContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <MobileNavProvider>{children}</MobileNavProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
