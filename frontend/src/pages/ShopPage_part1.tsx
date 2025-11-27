import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  type: 'booster' | 'card' | 'cosmetic';
  rarity?: string;
  image?: string;
  priceCredits?: number;
  priceCash?: number;
  level?: number;
  atk?: number;
  def?: number;
}

interface Card {
  id: string;
  name: string;
  description: string;
  cardImage: string;
  rarity: string;
  type: string;
  atk?: number;
  def?: number;
  level?: number;
  priceCredits?: number;
  priceCash?: number;
  isForSale: boolean;
}

export default function ShopPage() {
  const { user } = useAuthStore();
  const [selectedTab, setSelectedTab] = useState<'boosters' | 'singles' | 'cosmetics'>('boosters');
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);

  // Buscar cartas da loja ao carregar a página
  useEffect(() => {
    const fetchCards = async () => {
      try {
        setLoading(true);
        const response = await axios.get('http://localhost:3000/cards/shop/for-sale');
        setCards(response.data);
        console.log('📦 Cartas da loja carregadas:', response.data);
      } catch (error) {
        console.error('❌ Erro ao carregar cartas da loja:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCards();
  }, []);
