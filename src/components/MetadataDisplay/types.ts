export interface FileMetadata {
  [key: string]: string | number | boolean | Date;
}

export interface RuleResult {
  category: string;
  detected: boolean;
  points: number;
  weight: 'Fraco' | 'Médio' | 'Forte' | 'Muito Forte';
  description: string;
  evidence: string;
}

export interface CoOccurrenceBonus {
  combination: string;
  detected: boolean;
  points: number;
  description: string;
}

export interface ScoreResult {
  totalScore: number;
  adjustedScore: number;
  riskLevel: string;
  classification: string;
  confidenceLevel: string;
  isDigitalTransport: boolean;
  rules: RuleResult[];
  bonuses: CoOccurrenceBonus[];
  explanation: string;
}

export interface MetadataDisplayProps {
  file?: File;
  metadata: FileMetadata;
}