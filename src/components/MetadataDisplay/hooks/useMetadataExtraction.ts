import { useState, useEffect, useCallback } from 'react';
import { MetadataService } from '@/services/MetadataService';
import { useToast } from '@/components/ui/use-toast';
import { generateHash } from '../utils/formatters';
import { calculateAlterationScore } from '../utils/scoringEngine';
import type { FileMetadata, ScoreResult } from '../types';

export function useMetadataExtraction(file?: File, initialMetadata?: FileMetadata) {
  const [metadata, setMetadata] = useState<FileMetadata>(initialMetadata || {});
  const [isLoading, setIsLoading] = useState(!initialMetadata && !!file);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [exiftoolAvailable, setExiftoolAvailable] = useState(false);
  const { toast } = useToast();

  const extractAllMetadata = useCallback(async () => {
    if (!file) return;

    setIsLoading(true);
    try {
      const extractedMetadata = await MetadataService.extractMetadata(file);
      
      // Adicionar informações básicas do arquivo
      const fileInfo: FileMetadata = {
        'Nome do Arquivo': file.name,
        'Tamanho': file.size,
        'Tipo MIME': file.type,
        'Última Modificação': new Date(file.lastModified),
        ...extractedMetadata
      };

      // Adicionar hashes se o arquivo não for muito grande
      if (file.size < 100 * 1024 * 1024) { // 100MB
        const buffer = await file.arrayBuffer();
        const sha256 = await generateHash(buffer, 'SHA-256');
        const sha1 = await generateHash(buffer, 'SHA-1');
        
        fileInfo['SHA-256'] = sha256;
        fileInfo['SHA-1'] = sha1;
      }

      setMetadata(fileInfo);
      
      // Calcular score de alteração
      const result = calculateAlterationScore(fileInfo);
      setScoreResult(result);

    } catch (error) {
      console.error('Erro ao extrair metadados:', error);
      toast({
        title: "Erro na Extração",
        description: "Não foi possível extrair alguns metadados do arquivo",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [file, toast]);

  const downloadMetadataAsJson = useCallback(() => {
    if (!file) return;

    const jsonData = {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      lastModified: new Date(file.lastModified).toISOString(),
      extractionTimestamp: new Date().toISOString(),
      exifReaderAvailable: exiftoolAvailable,
      metadata: metadata,
      alterationAnalysis: scoreResult
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { 
      type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metadata_${file.name.replace(/\.[^/.]+$/, '')}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Download Concluído",
      description: "Arquivo JSON com metadados baixado com sucesso",
      duration: 3000,
    });
  }, [file, metadata, scoreResult, exiftoolAvailable, toast]);

  useEffect(() => {
    if (initialMetadata && Object.keys(initialMetadata).length > 0) {
      setMetadata(initialMetadata);
      setIsLoading(false);
      const result = calculateAlterationScore(initialMetadata);
      setScoreResult(result);
    } else if (file) {
      extractAllMetadata();
    }
  }, [file, initialMetadata, extractAllMetadata]);

  return {
    metadata,
    isLoading,
    scoreResult,
    exiftoolAvailable,
    downloadMetadataAsJson,
    extractAllMetadata
  };
}