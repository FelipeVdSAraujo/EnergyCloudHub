// src/pages/DataPage.jsx
import { useOutletContext } from 'react-router-dom';

export default function DataPage() {
  const { meta, plugin } = useOutletContext();
  const Comp = plugin?.DataView;

  if (!plugin) {
    return <div className="text-sm text-gray-500">Loading model view...</div>;
  }

  if (!Comp) {
    return (
      <div className="text-sm text-red-600">
        Data view is not available for model "{meta.id}".
      </div>
    );
  }

  return <Comp modelId={meta.id} endpoints={meta.endpoints} />;
}
