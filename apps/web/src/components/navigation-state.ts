import { createContext } from "react";

export const NavigationDataContext = createContext<{
  committed: boolean;
} | null>(null);
