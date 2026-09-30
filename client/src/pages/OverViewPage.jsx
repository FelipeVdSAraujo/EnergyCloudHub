// src/pages/OverviewPage.jsx
import { useOutletContext } from 'react-router-dom';

function TextWithLinks({ text }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('http') ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function EMXDescription({ description }) {
  const paragraphs = description.split('\n\n').filter(Boolean);
  return (
    <div className="flex flex-col md:flex-row gap-6 mb-6">
      <div className="flex-1 text-gray-700 text-base leading-relaxed space-y-4">
        {paragraphs.map((para, i) => (
          <p key={i}><TextWithLinks text={para} /></p>
        ))}
      </div>
      <div className="md:w-72 shrink-0">
        <img
          src="/docs/nodes.png"
          alt="North Sea case nodes map"
          className="rounded-xl border border-gray-200 w-full h-auto"
        />
      </div>
    </div>
  );
}

function EmpireDescription({ description }) {
  const paragraphs = description.split('\n\n').filter(Boolean);
  return (
    <div className="flex flex-col md:flex-row gap-6 mb-6">
      <div className="flex-1 text-gray-700 text-base leading-relaxed space-y-4">
        {paragraphs.map((para, i) => (
          <p key={i}><TextWithLinks text={para} /></p>
        ))}
      </div>
      <div className="md:w-72 shrink-0">
        <img
          src="/docs/Empire.webp"
          alt="OpenEMPIRE overview"
          className="rounded-xl border border-gray-200 w-full h-auto"
        />
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { meta } = useOutletContext();
  const isEMX = meta?.id === 'emx';
  const isEmpire = meta?.id === 'empire';

  return (
    <div className="p-6 bg-white rounded-xl shadow-md">
      {/* Header */}
      <h2 className="text-3xl font-bold text-gray-900 mb-3">
        Overview
      </h2>

      {/* Description */}
      {isEMX ? (
        <EMXDescription description={meta.description || ''} />
      ) : isEmpire ? (
        <EmpireDescription description={meta.description || ''} />
      ) : (
        <p className="text-gray-700 text-base leading-relaxed mb-6 whitespace-pre-line">
          {meta.description || 'Model overview.'}
        </p>
      )}

      {/* External Links */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* GitHub Link */}
        {meta.github && (
          <a
            href={meta.github}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors duration-300 shadow-sm"
          >
            GitHub
          </a>
        )}

        {/* Docs Link */}
        {meta.docs && (
          <a
            href={meta.docs}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-300 shadow-sm"
          >
            Documentation
          </a>
        )}
      </div>
    </div>
  );
}
