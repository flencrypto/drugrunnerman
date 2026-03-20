export type ShopItemCode = 'PISTOL' | 'CAR' | 'STASH' | 'ARMOR' | 'INFORM' | 'MEDKIT' | 'LAWYER' | 'BOAT';

export interface ShopItem {
	code: ShopItemCode;
	name: string;
	emoji: string;
	price: number;
	description: string;
	/** Whether the item is consumed (one-time) or permanent */
	type: 'permanent' | 'consumable';
}
