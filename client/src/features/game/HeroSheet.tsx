import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface HeroSheetProps {
  heroId: string;
}

/** Placeholder — replaced by the game-panels agent. */
export function HeroSheet(props: HeroSheetProps) {
  return <UnderConstruction title="Hoja de héroe" compact detail={props.heroId} />;
}
