import { useState, useEffect, useCallback } from 'react';
import { MetadataService } from '@/services/MetadataService';
import { useToast } from '@/components/ui/use-toast';
import { generateHash } from '../utils/formatters';
import { calculateAlterationScore } from '../utils/scoringEngine';
import type { FileMetadata, ScoreResult } from '../types';

export function useMetadataExtraction(file?: File, initialMetadata?: FileMetadata) {
  const [metadata, setMetadata] = useState<FileMetadata>(initialMetadata || {});
  const [isLoading, setIsLoading] = useState(false);
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
    const jsonData = {
      fileName: file?.name || 'unknown',
      fileSize: file?.size || 0,
      fileType: file?.type || 'unknown',
      lastModified: file ? new Date(file.lastModified).toISOString() : new Date().toISOString(),
      extractionTimestamp: new Date().toISOString(),
      extractionSource: exiftoolAvailable ? 'API (Edge Function)' : 'Local (Browser)',
      metadata: metadata,
      alterationAnalysis: scoreResult
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { 
      type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = file?.name?.replace(/\.[^/.]+$/, '') || 'metadata';
    a.download = `metadata_${fileName}_${Date.now()}.json`;
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
      console.log('Using API-provided metadata:', initialMetadata);
      setMetadata(initialMetadata);
      setExiftoolAvailable(true); // API successfully provided metadata
      setIsLoading(false);
      
      // Calculate alteration score with API metadata
      if (file) {
        const score = calculateAlterationScore(initialMetadata);
        setScoreResult(score);
      }
    } else if (file) {
      console.log('API metadata not available, falling back to local extraction');
      setExiftoolAvailable(false);
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