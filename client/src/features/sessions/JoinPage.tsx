import { AppShell } from '../../components/layout/AppShell';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

/** Placeholder — replaced by the lobby agent. Route: /unirse. */
export default function JoinPage() {
  return (
    <AppShell title="Unirse a partida" subtitle="Elige una partida activa" back="/menu">
      <div className="mx-auto max-w-3xl p-6">
        <UnderConstruction title="Unirse a partida" />
      </div>
    </AppShell>
  );
}
