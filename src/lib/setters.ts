// Section-wise setters. When a machine's remark mentions a SETUP, the setter is
// chosen from its own section's list so there is no cross-section confusion.

export interface Setter {
  name: string
  trainer?: boolean
}

export const SETTERS: Record<string, Setter[]> = {
  IG: [
    { name: 'Amit' },
    { name: 'Pankaj K' },
    { name: 'Raymal' },
    { name: 'Kaushik' },
    { name: 'Taslim' },
    { name: 'Ramesh' },
    { name: 'Himesh', trainer: true },
    { name: 'Hritik', trainer: true },
  ],
  EG: [{ name: 'Jaglal' }, { name: 'Pawan', trainer: true }],
  HO: [{ name: 'Nihar' }, { name: 'Mehul' }, { name: 'Rohit' }, { name: 'Pankaj O' }],
  CG: [{ name: 'Baldev' }, { name: 'Kalpesh' }, { name: 'Gankesh' }, { name: 'Dilip' }],
  FG: [{ name: 'Tofik' }, { name: 'Vijay' }, { name: 'Naresh' }, { name: 'Sunil' }],
}

export function settersFor(group: string): Setter[] {
  return SETTERS[(group || '').toUpperCase()] ?? []
}

/** A remark counts as a setup when it mentions "setup" (SETUP, 1 HR SETUP, …). */
export function isSetup(remark: string): boolean {
  return /setup/i.test(remark || '')
}

export function setterLabel(s: Setter): string {
  return s.trainer ? `${s.name} (Trainer)` : s.name
}
