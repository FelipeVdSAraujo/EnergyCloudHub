// src/pages/ResultsPage.jsx
import { useOutletContext } from 'react-router-dom';


export default function ResultsPage() {
  const { meta, plugin } = useOutletContext();
  const Comp = plugin?.ResultsView;

  if (!plugin) {
    return <div className="text-sm text-gray-500">Loading model view...</div>;
  }

  if (!Comp) {
    return (
      <div className="text-sm text-red-600">
        Results view is not available for model "{meta.id}".
      </div>
    );
  }

  return <Comp modelId={meta.id} endpoints={meta.endpoints} />;
}
