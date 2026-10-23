import type { ReactNode } from 'react';
import GameIcon from '../components/GameIcon';

interface ShopFeaturedShelfProps {
  title: string;
  route: string;
  onExplore: () => void;
  children: ReactNode;
}

export default function ShopFeaturedShelf({ title, route, onExplore, children }: ShopFeaturedShelfProps) {
  return (
    <section className="market-featured-shelf" aria-label={title}>
      <div className="market-featured-shelf-heading">
        <div className="market-featured-shelf-title">
          <span className="market-featured-shelf-icon"><GameIcon route={route} size={30} /></span>
          <h3>{title}</h3>
        </div>
        <button type="button" className="market-featured-shelf-link" onClick={onExplore}>
          Ver categoria <span aria-hidden="true">→</span>
        </button>
      </div>
      {children}
    </section>
  );
}
