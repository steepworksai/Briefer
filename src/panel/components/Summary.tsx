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

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul>
      {items.map((item, i) => <li key={i}><Inline text={item} /></li>)}
    </ul>
  );
}

function Prose({ text }: { text: string }) {
  if (!text) return null;
  return <p><Inline text={text} /></p>;
}

export function Summary({ result, readingTimeSaved }: SummaryProps) {
  return (
    <div className="summary">
      <div className="badge">⏱ Saves ~{readingTimeSaved} min read</div>

      {result.tldr && (
        <Section title="TL;DR">
          <p><Inline text={result.tldr} /></p>
        </Section>
      )}

      {result.mode === "exploratory" && (
        <>
          {result.keyPoints.length > 0 && (
            <Section title="Key Points"><BulletList items={result.keyPoints} /></Section>
          )}
          {result.takeaway && (
            <Section title="Takeaway"><Prose text={result.takeaway} /></Section>
          )}
        </>
      )}

      {result.mode === "deep" && (
        <>
          {result.coreProblem && (
            <Section title="Core Problem"><Prose text={result.coreProblem} /></Section>
          )}
          {result.solutionMechanism && (
            <Section title="Solution Mechanism"><Prose text={result.solutionMechanism} /></Section>
          )}
          {result.structuralShift && (
            <Section title="Structural Shift"><Prose text={result.structuralShift} /></Section>
          )}
          {result.whyItsBetter.length > 0 && (
            <Section title="Why It's Better"><BulletList items={result.whyItsBetter} /></Section>
          )}
          {result.keyTakeaways.length > 0 && (
            <Section title="Key Takeaways"><BulletList items={result.keyTakeaways} /></Section>
          )}
        </>
      )}
    </div>
  );
}
