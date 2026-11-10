import type { Metadata } from 'next';
import { MuralTelao } from '@/components/mural/mural-telao';

export const metadata: Metadata = {
  title: 'Telão do mural | Igor & Bianca',
};

export default function MuralTelaoPage() {
  return <MuralTelao />;
}
