import { PROVENANCE_META, Provenance } from '../../../core/models/science.model';
import './provenance-badge.css';

export function ProvenanceBadge({ provenance, compact = true }: { provenance: Provenance; compact?: boolean }) {
  const meta = PROVENANCE_META[provenance];
  return (
    <span className="c-prov">
      <span className={`b prov-${provenance}`} title={meta.help}><i></i>{compact ? meta.short : meta.label}</span>
    </span>
  );
}
