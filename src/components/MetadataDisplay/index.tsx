import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Download } from 'lucide-react';
import { ScoreDisplay } from './components/ScoreDisplay';
import { MetadataTable } from './components/MetadataTable';
import { useMetadataExtraction } from './hooks/useMetadataExtraction';
import type { MetadataDisplayProps } from './types';

export function MetadataDisplay({ file, metadata: initialMetadata }: MetadataDisplayProps) {
  const {
    metadata,
    isLoading,
    scoreResult,
    exiftoolAvailable,
    downloadMetadataAsJson
  } = useMetadataExtraction(file, initialMetadata);

  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl shadow-card bg-gradient-card">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Analisando Metadados...
          </CardTitle>
          <p className="text-muted-foreground">
            Extraindo todos os metadados disponíveis do arquivo
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl shadow-card bg-gradient-card">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Metadados do Arquivo
          {exiftoolAvailable && (
            <Badge variant="outline" className="text-xs ml-2">
              ExifReader Ativo
            </Badge>
          )}
        </CardTitle>
        <p className="text-muted-foreground">
          Metadados extraídos com ExifReader - Biblioteca JavaScript completa para análise de arquivos
        </p>
        <div className="mt-4">
          <Button 
            onClick={downloadMetadataAsJson}
            className="flex items-center gap-2"
            variant="outline"
          >
            <Download className="h-4 w-4" />
            Baixar JSON
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {scoreResult && <ScoreDisplay scoreResult={scoreResult} />}
        <MetadataTable metadata={metadata} />
      </CardContent>
    </Card>
  );
}

export default MetadataDisplay;