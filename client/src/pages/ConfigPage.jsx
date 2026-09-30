// src/pages/ConfigPage.jsx
import { useOutletContext } from 'react-router-dom';
//import ConfigEditor from '../Config_edit';

export default function ConfigPage() {
  const { meta, plugin } = useOutletContext();
  const Comp = plugin?.ConfigForm;

  if (!plugin) {
    return <div className="text-sm text-gray-500">Loading model view...</div>;
  }

  if (!Comp) {
    return (
      <div className="text-sm text-red-600">
        Config view is not available for model "{meta.id}".
      </div>
    );
  }

  return <Comp modelId={meta.id} endpoints={meta.endpoints} />;
}
