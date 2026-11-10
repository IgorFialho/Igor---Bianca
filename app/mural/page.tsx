import type { Metadata } from 'next';
import { MuralFeed } from '@/components/mural/mural-feed';

export const metadata: Metadata = {
  title: 'Mural do casamento | Igor & Bianca',
};

export default function MuralPage() {
  return <MuralFeed />;
}
