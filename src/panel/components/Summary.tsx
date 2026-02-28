import type { SummaryResult } from "../../lib/api";

interface SummaryProps {
  result: SummaryResult;
  readingTimeSaved: number;
}

// Renders **bold** and *italic* markdown inline
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("*") && part.endsWith("*"))
          return <em key={i}>{part.slice(1, -1)}</em>;
        return part;
      })}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Summary({ result, readingTimeSaved }: SummaryProps) {
  return (
    <div className="summary">
      {readingTimeSaved > 0 && (
        <div className="badge">⏱ Saves ~{readingTimeSaved} min read</div>
      )}

      {result.tldr && (
        <Section title="TL;DR">
          <p><Inline text={result.tldr} /></p>
        </Section>
      )}

      {result.keyPoints.length > 0 && (
        <Section title="Key Points">
          <ul>
            {result.keyPoints.map((item, i) => (
              <li key={i}><Inline text={item} /></li>
            ))}
          </ul>
        </Section>
      )}

      {result.takeaway && (
        <Section title="Takeaway">
          <p><Inline text={result.takeaway} /></p>
        </Section>
      )}
    </div>
  );
}
