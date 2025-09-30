import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, AlertTriangle, Shield, Camera, MapPin, Palette, Code, FileText, Settings, Zap, Info, CheckCircle, XCircle, Image as ImageIcon } from 'lucide-react';
import { validateImageMetadata, type ValidationResult, DEFAULT_CONFIG } from '@/utils/exifValidation';

interface ExifToolMetadataDisplayProps {
  metadata: {
    metadata: any;
    rawExifData: any;
  };
}

export default function ExifToolMetadataDisplay({ metadata }: ExifToolMetadataDisplayProps) {
  const [isLoading] = useState(false);

  const exifData = metadata.rawExifData || {};
  const fileMetadata = metadata.metadata || {};

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Organize metadata by groups based on ExifTool Group:Tag format
  const organizedMetadata = useMemo(() => {
    const groups: Record<string, Record<string, any>> = {
      file: {},
      exif: {},
      gps: {},
      icc: {},
      adobe: {},
      composite: {},
      other: {}
    };

    Object.entries(exifData).forEach(([key, value]) => {
      if (key.startsWith('System:')) return; // Filter out System fields

      const [group, tag] = key.split(':', 2);
      const lowerGroup = group.toLowerCase();

      if (lowerGroup.includes('file')) {
        groups.file[key] = value;
      } else if (lowerGroup.includes('exif')) {
        groups.exif[key] = value;
      } else if (lowerGroup.includes('gps')) {
        groups.gps[key] = value;
      } else if (lowerGroup.includes('icc')) {
        groups.icc[key] = value;
      } else if (lowerGroup.includes('adobe') || lowerGroup.includes('photoshop') || lowerGroup.includes('xmp')) {
        groups.adobe[key] = value;
      } else if (lowerGroup.includes('composite') || lowerGroup.includes('jfif')) {
        groups.composite[key] = value;
      } else {
        groups.other[key] = value;
      }
    });

    return groups;
  }, [exifData]);

  // New validation system using centralized logic
  const validationResult = useMemo((): ValidationResult => {
    if (!exifData) {
      return {
        level: 3,
        label: 'Muito Forte',
        score: 50,
        canonicalCaptureDate: null,
        make: null,
        model: null,
        positiveSignals: [],
        riskSignals: ['Nenhum metadado disponível'],
        recommendation: 'Sem metadados disponíveis - análise forense necessária'
      };
    }

    return validateImageMetadata(exifData, DEFAULT_CONFIG);
  }, [exifData]);

  // Legacy manipulation score for backward compatibility
  const manipulationScore = useMemo(() => {
    return {
      score: validationResult.score,
      indicators: [...validationResult.riskSignals, ...validationResult.positiveSignals],
      details: [...validationResult.riskSignals, ...validationResult.positiveSignals],
      isProgressive: exifData?.['File:EncodingProcess']?.includes('Progressive') || false,
      is444: exifData?.['File:YCbCrSubSampling']?.includes('4:4:4') || false,
      hasHPAdobe: !!(exifData?.['APP14:Adobe'] || exifData?.['Adobe:APP14']),
      missingEssentialExif: validationResult.level > 0
    };
  }, [validationResult, exifData]);

  // Generate summary information
  const summary = useMemo(() => {
    const info: Record<string, string> = {};
    
    // Basic file info
    if (fileMetadata.file_name) info['Nome do arquivo'] = fileMetadata.file_name;
    if (fileMetadata.mime_type) info['Tipo MIME'] = fileMetadata.mime_type;
    if (fileMetadata.size_bytes) info['Tamanho'] = formatFileSize(fileMetadata.size_bytes);

    // Camera info from validation result
    if (validationResult.make) info['Fabricante'] = validationResult.make;
    if (validationResult.model) info['Modelo'] = validationResult.model;
    if (validationResult.canonicalCaptureDate) info['Data/Hora'] = validationResult.canonicalCaptureDate;
    
    // Image dimensions
    if (exifData['EXIF:ExifImageWidth'] && exifData['EXIF:ExifImageHeight']) {
      info['Dimensões'] = `${exifData['EXIF:ExifImageWidth']} × ${exifData['EXIF:ExifImageHeight']}`;
    }

    return info;
  }, [exifData, fileMetadata, validationResult]);

  // Digital Transport Detection (using flag from validation result)
  const isDigitalTransport = validationResult?.isDigitalTransport === true;

  // Use new validation system results
  const adjustedScore = validationResult.score;
  const classification = validationResult.label;

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const downloadMetadata = () => {
    const downloadData = {
      timestamp: new Date().toISOString(),
      originalFile: metadata?.metadata?.filename || 'unknown',
      validationResult: validationResult,
      legacyAnalysis: {
        score: adjustedScore,
        classification: classification,
        isDigitalTransport: isDigitalTransport,
        indicators: manipulationScore.indicators,
        details: manipulationScore.details
      },
      summary: summary,
      rawExifData: exifData,
      organizedMetadata: organizedMetadata
    };

    const blob = new Blob([JSON.stringify(downloadData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metadata-analysis-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderMetadataGroup = (title: string, icon: React.ReactNode, data: Record<string, any>) => {
    const entries = Object.entries(data);
    if (entries.length === 0) return null;

    return (
      <AccordionItem value={title.toLowerCase()}>
        <AccordionTrigger className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
          <Badge variant="secondary" className="ml-auto">
            {entries.length}
          </Badge>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2">
            {entries.map(([key, value]) => (
              <div key={key} className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2 rounded border">
                <div className="font-mono text-sm text-muted-foreground break-all">
                  {key}
                </div>
                <div className="text-sm break-all">
                  {formatValue(value)}
                </div>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Analisando metadados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Análise de Metadados</h1>
        <Button onClick={downloadMetadata} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Baixar JSON
        </Button>
      </div>

      <div className="space-y-6">
        {/* Enhanced Validation Analysis */}
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Análise de Validação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Nível de Risco:</span>
              <Badge 
                variant={
                  validationResult.level === 0 ? 'default' :
                  validationResult.level === 1 ? 'secondary' :
                  validationResult.level === 2 ? 'destructive' : 'destructive'
                }
                className="text-sm"
              >
                {validationResult.label} (Nível {validationResult.level}, {validationResult.score} pontos)
              </Badge>
            </div>

            {/* Canonical Capture Date */}
            {validationResult.canonicalCaptureDate && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Camera className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">
                      Data Canônica de Captura
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      {validationResult.canonicalCaptureDate}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Camera Info */}
            {(validationResult.make || validationResult.model) && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Camera className="h-4 w-4 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Informações da Câmera
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      {validationResult.make} {validationResult.model}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Positive Signals */}
            {validationResult.positiveSignals.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-green-700 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Sinais Positivos
                </h4>
                <div className="space-y-1">
                  {validationResult.positiveSignals.map((signal, index) => (
                    <div key={index} className="text-sm text-green-600 flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 mt-2 flex-shrink-0" />
                      {signal}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Signals */}
            {validationResult.riskSignals.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-orange-700 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Sinais de Risco
                </h4>
                <div className="space-y-1">
                  {validationResult.riskSignals.map((signal, index) => (
                    <div key={index} className="text-sm text-orange-600 flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-400 mt-2 flex-shrink-0" />
                      {signal}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendation */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-gray-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    Recomendação
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {validationResult.recommendation}
                  </p>
                </div>
              </div>
            </div>

            {/* Digital Transport Detection */}
            {isDigitalTransport && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">
                      Transporte Digital Detectado
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Imagem atende aos critérios de transporte digital
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Debug Info */}
            {import.meta.env.VITE_DEBUG_EXIF === 'true' && validationResult.debugInfo && (
              <details className="space-y-2">
                <summary className="text-sm font-medium cursor-pointer hover:text-primary">
                  Ver informações de debug
                </summary>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify(validationResult.debugInfo, null, 2)}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>

        {/* File Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Resumo do Arquivo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(summary).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm font-medium text-muted-foreground">{key}:</span>
                  <span className="text-sm font-mono">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detailed Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Metadados Detalhados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full">
              {renderMetadataGroup('Informações do Arquivo', <FileText className="h-4 w-4" />, organizedMetadata.file)}
              {renderMetadataGroup('EXIF - Dados da Câmera', <Camera className="h-4 w-4" />, organizedMetadata.exif)}
              {renderMetadataGroup('GPS - Localização', <MapPin className="h-4 w-4" />, organizedMetadata.gps)}
              {renderMetadataGroup('ICC - Perfil de Cor', <Palette className="h-4 w-4" />, organizedMetadata.icc)}
              {renderMetadataGroup('Adobe/XMP - Software', <Code className="h-4 w-4" />, organizedMetadata.adobe)}
              {renderMetadataGroup('Composite/JFIF', <ImageIcon className="h-4 w-4" />, organizedMetadata.composite)}
              {renderMetadataGroup('Outros Metadados', <Zap className="h-4 w-4" />, organizedMetadata.other)}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}