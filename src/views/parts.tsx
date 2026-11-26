import { useEffect, useState } from 'react';
import { assetUrl } from '../lib/storage';
import { STAGES, type Stage } from '../types';

export function useAssetUrl(id?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    void assetUrl(id).then((value) => {
      if (alive) setUrl(value);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

export function StageBadge({ stage }: { stage: Stage }) {
  const index = STAGES.findIndex((s) => s.id === stage);
  const label = STAGES[index]?.label ?? stage;
  const tone = stage === 'ready' ? 'badge--ok' : index >= 2 ? 'badge--accent' : '';
  return <span className={`badge ${tone}`}>{stage === 'ready' ? 'جاهز للنشر' : label}</span>;
}

export function MiniStages({ stage }: { stage: Stage }) {
  const index = STAGES.findIndex((s) => s.id === stage);
  return (
    <div className="mini-stages" aria-hidden="true">
      {STAGES.map((s, i) => (
        <span key={s.id} className={i <= index ? 'is-done' : ''} />
      ))}
    </div>
  );
}
