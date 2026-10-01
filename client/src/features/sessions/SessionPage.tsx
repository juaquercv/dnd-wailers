import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

/** Placeholder — replaced by the lobby agent. Route: /sesion/:sessionId. */
export default function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return (
    <AppShell title="Partida" back="/menu">
      <div className="mx-auto max-w-3xl p-6">
        <UnderConstruction title="Partida en vivo" detail={sessionId} />
      </div>
    </AppShell>
  );
}
