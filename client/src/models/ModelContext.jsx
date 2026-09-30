// src/models/ModelContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { models, getModelById } from './registry';

const ModelContext = createContext(null);

export function ModelProvider({ children }) {
  const [activeModelId, setActiveModelId] = useState(() => {
    return localStorage.getItem('activeModelId') || null;
  });
  const [meta, setMeta] = useState(() => (activeModelId ? getModelById(activeModelId) : null));
  const [plugin, setPlugin] = useState(null);

  useEffect(() => {
    if (!activeModelId) {
      setMeta(null);
      setPlugin(null);
      return;
    }
    const m = getModelById(activeModelId);
    setMeta(m || null);
    localStorage.setItem('activeModelId', activeModelId);
  }, [activeModelId]);

  useEffect(() => {
    let mounted = true;
    setPlugin(null);
    if (meta?.loadPlugin) {
      meta.loadPlugin().then(p => { if (mounted) setPlugin(p); });
    }
    return () => { mounted = false; };
  }, [meta]);

  const value = useMemo(() => ({
    activeModelId,
    setActiveModelId,
    meta,
    plugin,
    models, // expose list for menus
  }), [activeModelId, meta, plugin]);

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

export function useModel() {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error('useModel must be used within <ModelProvider>');
  return ctx;
}
