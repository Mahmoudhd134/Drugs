export interface Drug {
    id: number;
    name: string;
    description?: string | null;
}

export type SaveDrug = { name: string; description: string | null };
