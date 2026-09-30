// src/frnt_home.jsx
import { useNavigate } from 'react-router-dom';
import { models } from './models/registry';

export default function ModelsPage() {
  const navigate = useNavigate();

  const select = (id) => {
    localStorage.setItem('activeModelId', id)
    navigate(`/${id}/overview`);}

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-6">Select a model</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {models.map(m => (
          <button
            key={m.id}
            onClick={() => select(m.id)}
            className="text-left p-5 rounded-2xl shadow-sm bg-white hover:shadow border border-gray-200"
          >
            <div className="text-xl font-semibold">{m.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
