// src/pages/ModelLayout.jsx
import { NavLink, Outlet, useParams, Navigate } from 'react-router-dom';
import { getModelById } from '../models/registry';
import { useEffect, useState } from 'react';

export default function ModelLayout() {
  const { modelId } = useParams();
  const meta = getModelById(modelId);
  const [plugin, setPlugin] = useState(null);
  const [pluginError, setPluginError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setPlugin(null);
    setPluginError('');

    const timeoutId = setTimeout(() => {
      if (mounted) {
        setPluginError('Timed out while loading model assets. Please retry.');
      }
    }, 15000);
  
    if (meta?.loadPlugin) {
      meta
        .loadPlugin()
        .then(p => {
          if (mounted) {
            clearTimeout(timeoutId);
            setPlugin(p);
          }
        })
        .catch((error) => {
          if (mounted) {
            clearTimeout(timeoutId);
            console.error('Failed to load model plugin:', error);
            setPluginError(error?.message || 'Failed to load model plugin.');
          }
        });
    } else {
      clearTimeout(timeoutId);
      setPluginError('No plugin loader registered for this model.');
    }
  
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [meta, reloadKey]);
  
  

  if (!meta) return <Navigate to="/models" replace />;

  return (
    <div className="min-h-[calc(100vh-80px)]"> {/* adjust if header is different height */}
      {/* Side-by-side layout */}
      <div className="mx-auto max-w-screen-2xl px-4 md:px-6 py-6">
        <div className="flex gap-6">
          {/* Sidebar (fixed width) */}
          <aside className="w-3250 shrink-0">
            <div className="sticky top-4">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
                <div className="mb-4">
                  <div className="text-sm text-gray-500">Active model</div>
                  <div className="font-semibold">{meta.name}</div>
                </div>
                <nav className="flex flex-col gap-1">
                  {meta.nav.map(item => (
                    <NavLink
                      key={item.path}
                      to={`/${meta.id}/${item.path}`}
                      className={({ isActive }) =>
                        `px-3 py-2 rounded-lg text-sm transition ${
                          isActive
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </div>
            </div>
          </aside>

          {/* Main content (fills remaining space) */}
          <section className="flex-1">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              {pluginError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                  <p className="font-medium">Could not load model view.</p>
                  <p className="mt-1 text-sm">{pluginError}</p>
                  <button
                    type="button"
                    onClick={() => setReloadKey((prev) => prev + 1)}
                    className="mt-3 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
              {!pluginError ? <Outlet context={{ meta, plugin }} /> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
