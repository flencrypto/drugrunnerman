import type { Drug } from './drug';

export interface Location {
	name?: string;
	adjust: Partial<Record<Drug['code'], number>>;
}
