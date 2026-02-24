import { useEffect, useRef } from 'react';

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'agent' | 'event';
  text: string;
}

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
  userPartial: string;
  agentPartial: string;
}

export const TranscriptPanel = ({ entries, userPartial, agentPartial }: TranscriptPanelProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollRef.current || !endRef.current) {
      return;
    }

    endRef.current.scrollIntoView({
      behavior: 'auto',
      block: 'end'
    });
  }, [entries, userPartial, agentPartial]);

  return (
    <section className="panel transcript-panel">
      <h2>live transcript</h2>

      <div className="transcript-scroll" ref={scrollRef}>
        {entries.length === 0 ? <p className="empty-state">No transcript yet. Start a live session.</p> : null}

        {entries.map((entry) => (
          <article key={entry.id} className={`transcript-item transcript-${entry.role}`}>
            <header>{entry.role}</header>
            <p>{entry.text}</p>
          </article>
        ))}

        {userPartial ? (
          <article className="transcript-item transcript-user transcript-partial">
            <header>user (streaming)</header>
            <p>{userPartial}</p>
          </article>
        ) : null}

        {agentPartial ? (
          <article className="transcript-item transcript-agent transcript-partial">
            <header>agent (streaming)</header>
            <p>{agentPartial}</p>
          </article>
        ) : null}

        <div ref={endRef} />
      </div>
    </section>
  );
};
