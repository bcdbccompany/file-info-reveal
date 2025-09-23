import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SupabaseUploadZone } from '@/components/SupabaseUploadZone';
import MetadataDisplay from '@/components/MetadataDisplay';

export default function Index() {
  const [metadata, setMetadata] = useState<any>({});
  const [analysisType, setAnalysisType] = useState<'quick' | 'complete'>('quick');
  const [externalProcessingUrl, setExternalProcessingUrl] = useState<string>();

  const handleMetadataExtracted = (extractedMetadata: any, analysis: any) => {
    setMetadata(extractedMetadata);
    setAnalysisType(analysis.isQuickAnalysis ? 'quick' : 'complete');
  };

  const handleProcessingComplete = (fullMetadata: any) => {
    setMetadata(fullMetadata);
    setAnalysisType('complete');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Análise Forense de Metadados
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Sistema híbrido de análise: preview instantâneo com ExifReader + análise completa com ExifTool
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Upload e Processamento</CardTitle>
              <CardDescription>
                Faça upload de uma imagem para análise de metadados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SupabaseUploadZone
                onMetadataExtracted={handleMetadataExtracted}
                onProcessingComplete={handleProcessingComplete}
                externalProcessingUrl={externalProcessingUrl}
              />
              
              <div className="mt-4 p-3 bg-muted rounded-md">
                <h4 className="font-medium mb-2">Configurar Serviço ExifTool (Opcional)</h4>
                <input
                  type="url"
                  placeholder="URL do webhook do seu serviço Node.js com ExifTool"
                  value={externalProcessingUrl || ''}
                  onChange={(e) => setExternalProcessingUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Sem configuração: Apenas análise ExifReader<br/>
                  Com configuração: Análise ExifReader + ExifTool completo
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Resultados da Análise
                {analysisType === 'quick' && (
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                    Análise Rápida
                  </span>
                )}
                {analysisType === 'complete' && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                    Análise Completa
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Metadados extraídos e análise forense da imagem
              </CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(metadata).length > 0 ? (
                <MetadataDisplay metadata={metadata} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-lg mb-2">Nenhuma imagem carregada</p>
                  <p className="text-sm">
                    Faça upload de uma imagem para ver os metadados extraídos
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Como Funciona</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2 text-blue-600">1. Análise Rápida (ExifReader)</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Processamento instantâneo no navegador</li>
                    <li>• Extração de EXIF, IPTC, XMP básicos</li>
                    <li>• Análise forense inicial</li>
                    <li>• Resultados em &lt; 1 segundo</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-green-600">2. Análise Completa (ExifTool)</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Processamento no servidor Node.js</li>
                    <li>• ExifTool com todos os recursos</li>
                    <li>• Análise forense profissional</li>
                    <li>• Resultados em 1-5 segundos</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}