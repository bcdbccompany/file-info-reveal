import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import type { ScoreResult } from '../types';

interface ScoreDisplayProps {
  scoreResult: ScoreResult;
}

export function ScoreDisplay({ scoreResult }: ScoreDisplayProps) {
  const getRiskBadgeVariant = (riskLevel: string) => {
    switch (riskLevel) {
      case 'Baixo': return 'default';
      case 'Médio': return 'secondary';
      case 'Alto': return 'destructive';
      default: return 'outline';
    }
  };

  const getRiskIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case 'Baixo': return CheckCircle;
      case 'Médio': return Zap;
      case 'Alto': return AlertTriangle;
      default: return CheckCircle;
    }
  };

  const RiskIcon = getRiskIcon(scoreResult.riskLevel);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RiskIcon className="w-5 h-5" />
          Análise de Alteração
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Score Total:</p>
            <p className="text-2xl font-bold">{scoreResult.totalScore}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Score Ajustado:</p>
            <p className="text-2xl font-bold">{scoreResult.adjustedScore}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Nível de Risco:</p>
          <Badge variant={getRiskBadgeVariant(scoreResult.riskLevel)} className="text-sm">
            {scoreResult.riskLevel}
          </Badge>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Classificação:</p>
          <p className="text-sm">{scoreResult.classification}</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Confiança:</p>
          <p className="text-sm">{scoreResult.confidenceLevel}</p>
        </div>

        {scoreResult.isDigitalTransport && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              📱 Transporte Digital Detectado - Algumas alterações podem ser devido ao compartilhamento digital
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Explicação:</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {scoreResult.explanation}
          </p>
        </div>

        {scoreResult.rules.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Regras Detectadas:</p>
            <div className="space-y-1">
              {scoreResult.rules.filter(rule => rule.detected).map((rule, index) => (
                <div key={index} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <span className="text-xs">{rule.description}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {rule.weight}
                    </Badge>
                    <span className="text-xs font-mono">+{rule.points}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {scoreResult.bonuses.length > 0 && scoreResult.bonuses.some(bonus => bonus.detected) && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Bônus de Co-ocorrência:</p>
            <div className="space-y-1">
              {scoreResult.bonuses.filter(bonus => bonus.detected).map((bonus, index) => (
                <div key={index} className="flex justify-between items-center p-2 bg-green-50 dark:bg-green-900/20 rounded">
                  <span className="text-xs">{bonus.description}</span>
                  <span className="text-xs font-mono text-green-600 dark:text-green-400">+{bonus.points}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}