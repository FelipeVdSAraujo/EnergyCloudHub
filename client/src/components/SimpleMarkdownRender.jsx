function SimpleMarkdownRender({ text }) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements = [];
  let inList = false;
  let listItems = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      if (inList && listItems.length > 0) {
        elements.push(
          <ul key={`list-${i}`} className="list-disc list-inside ml-4 mb-4">
            {listItems.map((item, idx) => (
              <li key={idx} className="text-gray-700">
                {renderInlineMarkdown(item, `li-${i}-${idx}`)}
              </li>
            ))}
          </ul>
        );
        listItems = [];
        inList = false;
      }
      elements.push(<div key={`space-${i}`} className="h-2" />);
      continue;
    }

    if (line.startsWith("- ")) {
      inList = true;
      listItems.push(line.replace(/^- /, ""));
      continue;
    }

    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`list-${i}`} className="list-disc list-inside ml-4 mb-4">
          {listItems.map((item, idx) => (
            <li key={idx} className="text-gray-700">
              {renderInlineMarkdown(item, `li-${i}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }

    if (line.startsWith("## ")) {
      const heading = line.replace(/^## /, "");
      elements.push(
        <h3 key={`h3-${i}`} className="text-lg font-semibold text-gray-800 mt-4 mb-2">
          {heading}
        </h3>
      );
    } else if (line.startsWith("# ")) {
      const heading = line.replace(/^# /, "");
      elements.push(
        <h2 key={`h2-${i}`} className="text-xl font-bold text-gray-900 mt-6 mb-3">
          {heading}
        </h2>
      );
    } else {
      const renderedLine = renderInlineMarkdown(line, i);
      elements.push(
        <p key={`p-${i}`} className="text-gray-700 leading-relaxed mb-3">
          {renderedLine}
        </p>
      );
    }
  }

  if (inList && listItems.length > 0) {
    elements.push(
      <ul key="final-list" className="list-disc list-inside ml-4 mb-4">
        {listItems.map((item, idx) => (
          <li key={idx} className="text-gray-700">
            {renderInlineMarkdown(item, `li-final-${idx}`)}
          </li>
        ))}
      </ul>
    );
  }

  return <div>{elements}</div>;
}

function renderInlineMarkdown(text, key) {
  const parts = [];
  let lastIndex = 0;
  const inlineRegex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  let partKey = 0;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    if (match[0].startsWith("**")) {
      parts.push(<strong key={`${key}-b-${partKey++}`}>{match[1]}</strong>);
    } else {
      parts.push(
        <a
          key={`${key}-a-${partKey++}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline hover:text-blue-800"
        >
          {match[2]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default SimpleMarkdownRender;
