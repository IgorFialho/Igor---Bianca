import type { Metadata } from 'next';
import { GiftRegistry } from '@/components/gifts/gift-registry';

export const metadata: Metadata = {
  title: 'Lista de presentes | Igor & Bianca',
};

export default function GiftsPage() {
  return <GiftRegistry />;
}
