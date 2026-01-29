'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface UncategorizedCountContextType {
  count: number;
  setCount: (count: number) => void;
}

const UncategorizedCountContext = createContext<UncategorizedCountContextType | undefined>(undefined);

export function UncategorizedCountProvider({ children }: { children: ReactNode }) {
  const [count, setCountState] = useState(0);

  const setCount = useCallback((newCount: number) => {
    setCountState(newCount);
  }, []);

  return (
    <UncategorizedCountContext.Provider value={{ count, setCount }}>
      {children}
    </UncategorizedCountContext.Provider>
  );
}

export function useUncategorizedCount() {
  const context = useContext(UncategorizedCountContext);
  if (context === undefined) {
    throw new Error('useUncategorizedCount must be used within a UncategorizedCountProvider');
  }
  return context;
}
