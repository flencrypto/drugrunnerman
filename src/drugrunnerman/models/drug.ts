export interface Drug {
	code: 'CAN' | 'COC' | 'HER' | 'METH' | 'MDM' | 'FEN';
	name: string;
	mu: number;
	sigma: number;
	unit: 'g' | 'tablet' | 'pill';
	currency?: string;
}
