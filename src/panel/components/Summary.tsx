import type { SummaryResult } from "../../lib/api";

interface SummaryProps {
  result: SummaryResult;
  readingTimeSaved: number;
  editable?: boolean;
  onChange?: (next: SummaryResult) => void;
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

export function Summary({ result, readingTimeSaved, editable = false, onChange }: SummaryProps) {
  const update = (patch: Partial<SummaryResult>) => {
    if (!onChange) return;
    onChange({ ...result, ...patch });
  };

  const updatePoint = (idx: number, value: string) => {
    const next = [...result.keyPoints];
    next[idx] = value;
    update({ keyPoints: next });
  };

  const removePoint = (idx: number) => {
    const next = result.keyPoints.filter((_, i) => i !== idx);
    update({ keyPoints: next });
  };

  const movePoint = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= result.keyPoints.length) return;
    const next = [...result.keyPoints];
    [next[idx], next[to]] = [next[to], next[idx]];
    update({ keyPoints: next });
  };

  const addPoint = () => {
    update({ keyPoints: [...result.keyPoints, ""] });
  };

  return (
    <div className="summary">
      {readingTimeSaved > 0 && (
        <div className="badge">⏱ Saves ~{readingTimeSaved} min read</div>
      )}

      {result.tldr && (
        <Section title="TL;DR">
          {editable ? (
            <textarea
              className="summary-edit"
              value={result.tldr}
              onChange={(e) => update({ tldr: e.target.value })}
            />
          ) : (
            <p><Inline text={result.tldr} /></p>
          )}
        </Section>
      )}

      {(result.keyPoints.length > 0 || editable) && (
        <Section title="Key Points">
          {editable ? (
            <div className="summary-kp-list">
              {result.keyPoints.map((item, i) => (
                <div className="summary-kp-row" key={i}>
                  <textarea
                    className="summary-edit summary-edit--point"
                    value={item}
                    onChange={(e) => updatePoint(i, e.target.value)}
                  />
                  <div className="summary-kp-actions">
                    <button type="button" className="summary-kp-btn" onClick={() => movePoint(i, -1)} title="Move up">↑</button>
                    <button type="button" className="summary-kp-btn" onClick={() => movePoint(i, 1)} title="Move down">↓</button>
                    <button type="button" className="summary-kp-btn summary-kp-btn--danger" onClick={() => removePoint(i)} title="Remove point">✕</button>
                  </div>
                </div>
              ))}
              <button type="button" className="summary-kp-add" onClick={addPoint}>+ Add Point</button>
            </div>
          ) : (
            <ul>
              {result.keyPoints.map((item, i) => (
                <li key={i}><Inline text={item} /></li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {result.takeaway && (
        <Section title="Key Takeaway">
          {editable ? (
            <textarea
              className="summary-edit"
              value={result.takeaway}
              onChange={(e) => update({ takeaway: e.target.value })}
            />
          ) : (
            <p><Inline text={result.takeaway} /></p>
          )}
        </Section>
      )}
    </div>
  );
}
