import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

/** Placeholder — replaced by the editor-shell agent. Route: /campanas/:campaignId/editor. */
export default function EditorPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  return (
    <AppShell title="Editor de campaña" back="/campanas">
      <div className="mx-auto max-w-3xl p-6">
        <UnderConstruction title="Editor de campaña" detail={campaignId} />
      </div>
    </AppShell>
  );
}
