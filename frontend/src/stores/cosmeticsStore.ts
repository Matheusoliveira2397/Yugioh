import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface OwnedPlaymat {
  id: string;
  name: string;
  image: string;
}

export interface OwnedSkin {
  id: string;
  name: string;
  image: string;
}

interface CosmeticsState {
  ownedPlaymats: OwnedPlaymat[];
  ownedSkins: OwnedSkin[];
  equippedPlaymatId: string | null;
  equippedSkinId: string | null;
  addPlaymat: (playmat: OwnedPlaymat) => void;
  addSkin: (skin: OwnedSkin) => void;
  equipPlaymat: (id: string) => void;
  unequipPlaymat: () => void;
  equipSkin: (id: string) => void;
  unequipSkin: () => void;
}

export const useCosmeticsStore = create<CosmeticsState>()(
  persist(
    (set, get) => ({
      ownedPlaymats: [],
      ownedSkins: [],
      equippedPlaymatId: null,
      equippedSkinId: null,

      addPlaymat: (playmat: OwnedPlaymat) => {
        const { ownedPlaymats } = get();
        if (ownedPlaymats.some((p) => p.id === playmat.id)) return;
        set({ ownedPlaymats: [...ownedPlaymats, playmat] });
      },

      addSkin: (skin: OwnedSkin) => {
        const { ownedSkins } = get();
        if (ownedSkins.some((s) => s.id === skin.id)) return;
        set({ ownedSkins: [...ownedSkins, skin] });
      },

      equipPlaymat: (id: string) => {
        set({ equippedPlaymatId: id });
      },

      unequipPlaymat: () => {
        set({ equippedPlaymatId: null });
      },

      equipSkin: (id: string) => {
        set({ equippedSkinId: id });
      },

      unequipSkin: () => {
        set({ equippedSkinId: null });
      },
    }),
    {
      name: 'cosmetics-storage',
    }
  )
);


