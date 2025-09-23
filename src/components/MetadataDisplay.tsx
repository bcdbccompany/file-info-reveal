import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FileText, Calendar, HardDrive, Hash, Image, MapPin, Camera, Palette, Zap, AlertTriangle, CheckCircle, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { MetadataService } from '@/services/MetadataService';
import { useToast } from '@/components/ui/use-toast';

interface FileMetadata {
  [key: string]: string | number | boolean | Date;
}

// Comprehensive scoring interfaces based on validation matrix
interface RuleResult {
  category: string;
  detected: boolean;
  points: number;
  weight: 'Fraco' | 'Médio' | 'Forte' | 'Muito Forte';
  description: string;
  evidence: string;
}

interface CoOccurrenceBonus {
  combination: string;
  detected: boolean;
  points: number;
  description: string;
}

interface ScoreResult {
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

interface MetadataDisplayProps {
  file?: File;
  metadata?: FileMetadata;
}

function MetadataDisplay({ file, metadata: initialMetadata }: MetadataDisplayProps) {
  const [metadata, setMetadata] = useState<FileMetadata>(initialMetadata || {});
  const [isLoading, setIsLoading] = useState(!initialMetadata && !!file);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [exiftoolAvailable, setExiftoolAvailable] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (initialMetadata && Object.keys(initialMetadata).length > 0) {
      setMetadata(initialMetadata);
      setIsLoading(false);
      const result = calculateAlterationScore(initialMetadata);
      setScoreResult(result);
    } else if (file) {
      extractAllMetadata();
    }
  }, [file, initialMetadata]);

  const formatValue = (value: any): string => {
    if (value instanceof Date) {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'full',
        timeStyle: 'medium'
      }).format(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'Sim' : 'Não';
    }
    if (typeof value === 'number') {
      if (value > 1024 && !value.toString().includes('.')) {
        return formatFileSize(value);
      }
      return value.toLocaleString('pt-BR');
    }
    return String(value);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const downloadMetadataAsJson = () => {
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
  };

  const generateHash = async (buffer: ArrayBuffer, algorithm: string = 'SHA-256'): Promise<string> => {
    try {
      const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return 'Não disponível';
    }
  };

  const analyzeImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject('Não é imagem');
        return;
      }
      
      const img = document.createElement('img') as HTMLImageElement;
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject('Erro ao carregar imagem');
      };
      
      img.src = url;
    });
  };

  const extractExifData = async (buffer: ArrayBuffer): Promise<{ [key: string]: any }> => {
    const exifData: { [key: string]: any } = {};
    const dataView = new DataView(buffer);
    
    try {
      // Verificar se é JPEG
      if (dataView.getUint16(0) !== 0xFFD8) {
        return exifData;
      }

      let offset = 2;
      while (offset < dataView.byteLength - 10) {
        const marker = dataView.getUint16(offset);
        
        if (marker === 0xFFE1) { // APP1 segment (EXIF)
          const segmentLength = dataView.getUint16(offset + 2);
          const segmentStart = offset + 4;
          
          // Verificar cabeçalho EXIF
          if (segmentStart + 10 < dataView.byteLength &&
              dataView.getUint32(segmentStart) === 0x45786966 && 
              dataView.getUint16(segmentStart + 4) === 0x0000) {
            
            const tiffStart = segmentStart + 6;
            if (tiffStart + 8 < dataView.byteLength) {
              const byteOrder = dataView.getUint16(tiffStart);
              const littleEndian = byteOrder === 0x4949;
              
              exifData['Byte Order'] = littleEndian ? 'Little-endian (Intel)' : 'Big-endian (Motorola)';
              
              const ifdOffset = littleEndian ? 
                dataView.getUint32(tiffStart + 4, true) : 
                dataView.getUint32(tiffStart + 4, false);
              
              // Ler IFD0 com validação
              if (tiffStart + ifdOffset + 2 < dataView.byteLength) {
                parseIFD(dataView, tiffStart + ifdOffset, tiffStart, littleEndian, exifData, new Set());
              }
            }
          }
          
          break;
        }
        
        // Pular para próximo segment
        if (marker >= 0xFFC0 && marker <= 0xFFCF && marker !== 0xFFC4 && marker !== 0xFFC8) {
          break;
        }
        
        const segmentLength = dataView.getUint16(offset + 2);
        if (segmentLength < 2 || offset + segmentLength >= dataView.byteLength) break;
        offset += 2 + segmentLength;
      }
      
    } catch (error) {
      console.warn('Erro ao extrair EXIF:', error);
    }
    
    return exifData;
  };

  const parseIFD = (dataView: DataView, ifdOffset: number, tiffStart: number, littleEndian: boolean, exifData: any, visitedOffsets: Set<number>) => {
    try {
      // Prevenir recursão infinita
      if (visitedOffsets.has(ifdOffset) || ifdOffset < 0 || ifdOffset + 2 > dataView.byteLength) {
        return;
      }
      visitedOffsets.add(ifdOffset);

      const numEntries = littleEndian ? 
        dataView.getUint16(ifdOffset, true) : 
        dataView.getUint16(ifdOffset, false);

      // Validar número de entradas
      if (numEntries > 200 || ifdOffset + 2 + (numEntries * 12) > dataView.byteLength) {
        return;
      }

      for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifdOffset + 2 + (i * 12);
        
        if (entryOffset + 12 > dataView.byteLength) break;
        
        const tag = littleEndian ? 
          dataView.getUint16(entryOffset, true) : 
          dataView.getUint16(entryOffset, false);
        
        const type = littleEndian ? 
          dataView.getUint16(entryOffset + 2, true) : 
          dataView.getUint16(entryOffset + 2, false);
        
        const count = littleEndian ? 
          dataView.getUint32(entryOffset + 4, true) : 
          dataView.getUint32(entryOffset + 4, false);

        // Tags EXIF expandidos
        const tagNames: { [key: number]: string } = {
          0x010F: 'Make',
          0x0110: 'Model', 
          0x0112: 'Orientation',
          0x011A: 'XResolution',
          0x011B: 'YResolution',
          0x0128: 'ResolutionUnit',
          0x0131: 'Software',
          0x0132: 'ModifyDate',
          0x0213: 'YCbCrPositioning',
          0x829A: 'ExposureTime',
          0x829D: 'FNumber',
          0x8822: 'ExposureProgram',
          0x8827: 'ISO',
          0x9000: 'ExifVersion',
          0x9003: 'DateTimeOriginal',
          0x9004: 'CreateDate',
          0x9101: 'ComponentsConfiguration',
          0x9207: 'MeteringMode',
          0x9209: 'Flash',
          0x920A: 'FocalLength',
          0x9286: 'UserComment',
          0xA000: 'FlashPixVersion',
          0xA001: 'ColorSpace',
          0xA002: 'ExifImageWidth',
          0xA003: 'ExifImageHeight',
          0xA402: 'ExposureMode',
          0xA403: 'WhiteBalance',
          0xA406: 'SceneCaptureType',
          0x8769: 'ExifIFDOffset',
          0x8825: 'GPSInfoOffset'
        };

        const tagName = tagNames[tag] || `Tag_0x${tag.toString(16).toUpperCase()}`;
        
        try {
          let value = readTagValue(dataView, entryOffset + 8, type, count, tiffStart, littleEndian);
          
          // Formatações especiais
          if (tag === 0x0112 && typeof value === 'number') {
            const orientations = ['', 'Rotate 0°', 'Rotate 180°', 'Rotate 180°', 'Rotate 180°', 'Rotate 270° CW', 'Rotate 90° CW', 'Rotate 270° CCW', 'Rotate 90° CCW'];
            value = orientations[value] || `Orientation ${value}`;
          } else if (tag === 0x8822 && typeof value === 'number') {
            const programs = ['Not Defined', 'Manual', 'Program AE', 'Aperture Priority', 'Shutter Priority', 'Creative', 'Action', 'Portrait', 'Landscape'];
            value = programs[value] || `Program ${value}`;
          } else if (tag === 0x9207 && typeof value === 'number') {
            const meteringModes = ['Unknown', 'Average', 'Center-weighted average', 'Spot', 'Multi-spot', 'Multi-segment', 'Partial'];
            value = meteringModes[value] || `Metering ${value}`;
          } else if (tag === 0x9209 && typeof value === 'number') {
            value = (value & 1) ? 'Flash' : 'No Flash';
          } else if (tag === 0xA001 && typeof value === 'number') {
            value = value === 1 ? 'sRGB' : value === 65535 ? 'Uncalibrated' : `ColorSpace ${value}`;
          } else if (tag === 0x9101 && typeof value === 'string') {
            // ComponentsConfiguration para detectar YCbCr
            if (value.includes('1') && value.includes('2') && value.includes('3')) {
              exifData['YCbCrSubSampling'] = 'YCbCr4:2:0';
            }
          }
          
          exifData[tagName] = value;
          
          // Processar sub-IFDs
          if (tag === 0x8769 && typeof value === 'number') { // EXIF SubIFD
            const exifIfdOffset = tiffStart + value;
            if (exifIfdOffset + 2 <= dataView.byteLength && !visitedOffsets.has(exifIfdOffset)) {
              parseIFD(dataView, exifIfdOffset, tiffStart, littleEndian, exifData, new Set(visitedOffsets));
            }
          }
          
        } catch (e) {
          // Ignorar tags problemáticas
        }
      }
      
    } catch (error) {
      console.warn('Erro ao parsear IFD:', error);
    }
  };

  const readTagValue = (dataView: DataView, offset: number, type: number, count: number, tiffStart: number, littleEndian: boolean): any => {
    let valueOffset = offset;
    
    // Se o valor for maior que 4 bytes, está armazenado em outro local
    if (getTypeSize(type) * count > 4) {
      valueOffset = tiffStart + (littleEndian ? dataView.getUint32(offset, true) : dataView.getUint32(offset, false));
    }
    
    switch (type) {
      case 1: // BYTE
        return dataView.getUint8(valueOffset);
      case 2: // ASCII
        let str = '';
        for (let i = 0; i < count - 1; i++) {
          const char = dataView.getUint8(valueOffset + i);
          if (char === 0) break;
          str += String.fromCharCode(char);
        }
        return str;
      case 3: // SHORT
        return littleEndian ? dataView.getUint16(valueOffset, true) : dataView.getUint16(valueOffset, false);
      case 4: // LONG
        return littleEndian ? dataView.getUint32(valueOffset, true) : dataView.getUint32(valueOffset, false);
      case 5: // RATIONAL
        const numerator = littleEndian ? dataView.getUint32(valueOffset, true) : dataView.getUint32(valueOffset, false);
        const denominator = littleEndian ? dataView.getUint32(valueOffset + 4, true) : dataView.getUint32(valueOffset + 4, false);
        return denominator === 0 ? 0 : numerator / denominator;
      case 7: // UNDEFINED
        return `(Binary data ${count} bytes)`;
      case 9: // SLONG
        return littleEndian ? dataView.getInt32(valueOffset, true) : dataView.getInt32(valueOffset, false);
      case 10: // SRATIONAL
        const sNumerator = littleEndian ? dataView.getInt32(valueOffset, true) : dataView.getInt32(valueOffset, false);
        const sDenominator = littleEndian ? dataView.getInt32(valueOffset + 4, true) : dataView.getInt32(valueOffset + 4, false);
        return sDenominator === 0 ? 0 : sNumerator / sDenominator;
      default:
        return `(Tipo desconhecido ${type})`;
    }
  };

  const getTypeSize = (type: number): number => {
    const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
    return sizes[type] || 1;
  };

  const analyzeColorProfile = (buffer: ArrayBuffer): { [key: string]: any } => {
    const profileData: { [key: string]: any } = {};
    const dataView = new DataView(buffer);
    
    try {
      // Procurar por perfil ICC embedded e dados de cor em JPEG
      let offset = 0;
      
      // Primeiro, procurar por segmentos JPEG APP2 (perfil ICC)
      if (dataView.getUint16(0) === 0xFFD8) { // JPEG
        offset = 2;
        while (offset < dataView.byteLength - 10) {
          const marker = dataView.getUint16(offset);
          
          if (marker === 0xFFE2) { // APP2 - geralmente contém perfil ICC
            const segmentLength = dataView.getUint16(offset + 2);
            const segmentStart = offset + 4;
            
            // Verificar assinatura ICC
            if (segmentStart + 12 < dataView.byteLength) {
              const iccHeader = new Uint8Array(buffer, segmentStart, 12);
              const iccString = String.fromCharCode(...iccHeader);
              
              if (iccString.includes('ICC_PROFILE')) {
                profileData['ICC Profile'] = 'Embedded';
                
                // Tentar extrair informações do perfil
                const profileStart = segmentStart + 14;
                if (profileStart + 128 < dataView.byteLength) {
                  // Ler cabeçalho do perfil ICC
                  const profileSize = dataView.getUint32(profileStart);
                  profileData['Profile Size'] = `${profileSize} bytes`;
                  
                  // Device class (offset 12 no perfil ICC)
                  if (profileStart + 15 < dataView.byteLength) {
                    const deviceClass = String.fromCharCode(
                      dataView.getUint8(profileStart + 12),
                      dataView.getUint8(profileStart + 13),
                      dataView.getUint8(profileStart + 14),
                      dataView.getUint8(profileStart + 15)
                    );
                    profileData['Device Class'] = deviceClass.trim();
                  }
                  
                  // Color space (offset 16 no perfil ICC)
                  if (profileStart + 19 < dataView.byteLength) {
                    const colorSpace = String.fromCharCode(
                      dataView.getUint8(profileStart + 16),
                      dataView.getUint8(profileStart + 17),
                      dataView.getUint8(profileStart + 18),
                      dataView.getUint8(profileStart + 19)
                    );
                    profileData['ColorSpace'] = colorSpace.trim();
                    
                    if (colorSpace.includes('RGB')) {
                      profileData['Color Model'] = 'RGB';
                    }
                  }
                }
              }
            }
          }
          
          const segmentLength = dataView.getUint16(offset + 2);
          if (segmentLength < 2) break;
          offset += 2 + segmentLength;
        }
      }
      
      // Procurar por assinatura 'acsp' (perfil ICC) em qualquer lugar do arquivo
      offset = 0;
      while (offset < dataView.byteLength - 4) {
        if (dataView.getUint32(offset) === 0x61637370) { // 'acsp'
          profileData['ICC Signature'] = 'Found';
          
          // Ler informações do perfil ICC
          if (offset >= 36) {
            const profileSize = dataView.getUint32(offset - 36);
            profileData['ICC Profile Size'] = `${profileSize} bytes`;
          }
          
          break;
        }
        offset++;
      }
      
      // Analisar componentes de cor JPEG
      if (dataView.getUint16(0) === 0xFFD8) {
        offset = 2;
        while (offset < dataView.byteLength - 10) {
          const marker = dataView.getUint16(offset);
          
          // Frame header markers
          if (marker === 0xFFC0 || marker === 0xFFC1 || marker === 0xFFC2) {
            const segmentLength = dataView.getUint16(offset + 2);
            const segmentStart = offset + 4;
            
            if (segmentStart + 6 < dataView.byteLength) {
              const precision = dataView.getUint8(segmentStart);
              const height = dataView.getUint16(segmentStart + 1);
              const width = dataView.getUint16(segmentStart + 3);
              const numComponents = dataView.getUint8(segmentStart + 5);
              
              profileData['Image Precision'] = `${precision} bits`;
              profileData['Color Components'] = numComponents;
              
              if (numComponents === 3) {
                profileData['Color Model Detection'] = 'YCbCr (3 components)';
              } else if (numComponents === 1) {
                profileData['Color Model Detection'] = 'Grayscale';
              }
            }
            break;
          }
          
          const segmentLength = dataView.getUint16(offset + 2);
          if (segmentLength < 2) break;
          offset += 2 + segmentLength;
        }
      }
      
      // Detectar padrões de cor no conteúdo
      const uint8Array = new Uint8Array(buffer);
      const sample = uint8Array.slice(0, Math.min(10000, uint8Array.length));
      
      // Heurística simples para detectar RGB vs YCbCr
      let rgbIndicators = 0;
      let ycbcrIndicators = 0;
      
      for (let i = 0; i < sample.length - 2; i++) {
        const r = sample[i];
        const g = sample[i + 1]; 
        const b = sample[i + 2];
        
        // Padrões típicos RGB (valores correlacionados)
        if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10) {
          rgbIndicators++;
        }
        
        // Padrões típicos YCbCr (primeiro byte Y, outros Cb/Cr)
        if (r > 16 && r < 235 && (g < 16 || g > 240 || b < 16 || b > 240)) {
          ycbcrIndicators++;
        }
      }
      
      const totalSamples = sample.length / 3;
      if (rgbIndicators / totalSamples > 0.3) {
        profileData['Content Analysis'] = 'RGB-like patterns detected';
      } else if (ycbcrIndicators / totalSamples > 0.2) {
        profileData['Content Analysis'] = 'YCbCr-like patterns detected';
      }
      
    } catch (error) {
      console.warn('Erro ao analisar perfil de cor:', error);
    }
    
    return profileData;
  };

  const extractAllMetadata = async () => {
    setIsLoading(true);
    const allMetadata: FileMetadata = {};

    try {
      // Usar ExifReader para extração completa de metadados
      console.log('Extraindo metadados com ExifReader...');
      const extractedMetadata = await MetadataService.extractMetadata(file);
      Object.assign(allMetadata, extractedMetadata);
      
      setExiftoolAvailable(true); // ExifReader sempre disponível
      
      toast({
        title: "ExifReader Ativo",
        description: "Metadados extraídos com ExifReader",
        duration: 3000,
      });
      
      // Análises adicionais com JavaScript
      const buffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      // Hashes criptográficos
      allMetadata['Hash SHA-256'] = await generateHash(buffer, 'SHA-256');
      allMetadata['Hash SHA-1'] = await generateHash(buffer, 'SHA-1');
      
      // Análise de entropy
      const entropy = calculateEntropy(uint8Array);
      allMetadata['Entropia (bits)'] = entropy.toFixed(4);
      allMetadata['Compressibilidade estimada'] = entropy > 7 ? 'Baixa' : entropy > 5 ? 'Média' : 'Alta';

      // Análise de bytes
      allMetadata['Primeiro byte (hex)'] = uint8Array[0]?.toString(16).padStart(2, '0').toUpperCase() || '00';
      allMetadata['Último byte (hex)'] = uint8Array[uint8Array.length - 1]?.toString(16).padStart(2, '0').toUpperCase() || '00';
      allMetadata['Bytes nulos'] = uint8Array.filter(b => b === 0).length;
      allMetadata['Bytes únicos'] = new Set(uint8Array).size;

      // Para imagens, extrair EXIF com parser JavaScript
      if (file.type.startsWith('image/')) {
        const exifData = await extractExifData(buffer);
        Object.assign(allMetadata, exifData);
        
        const colorProfile = analyzeColorProfile(buffer);
        Object.assign(allMetadata, colorProfile);
      }

      // Análise específica para diferentes tipos
      if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
        try {
          const text = await file.text();
          allMetadata['Linhas de texto'] = text.split('\n').length;
          allMetadata['Caracteres'] = text.length;
          allMetadata['Palavras estimadas'] = text.split(/\s+/).filter(w => w.length > 0).length;
          allMetadata['Encoding detectado'] = detectTextEncoding(uint8Array);
        } catch (error) {
          allMetadata['Erro análise texto'] = 'Não foi possível analisar';
        }
      }

      // WebkitRelativePath
      if ('webkitRelativePath' in file && (file as any).webkitRelativePath) {
        allMetadata['Caminho relativo'] = (file as any).webkitRelativePath;
        allMetadata['Profundidade diretório'] = (file as any).webkitRelativePath.split('/').length - 1;
      }

      // Informações do sistema
      allMetadata['Timestamp Unix'] = Math.floor(file.lastModified / 1000);
      allMetadata['ID único sessão'] = generateSimpleHash(file.name + file.size + file.lastModified);

      setMetadata(allMetadata);
      
      // Calcular pontuação de alteração baseada na matriz de validação
      const score = calculateAlterationScore(allMetadata);
      setScoreResult(score);
      
    } catch (error) {
      console.error('Erro ao extrair metadados:', error);
      setMetadata({ 'Erro': 'Falha na extração de metadados' });
      
      toast({
        title: "Erro na Extração",
        description: "Falhou ao extrair metadados do arquivo",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateEntropy = (data: Uint8Array): number => {
    const frequencies: { [key: number]: number } = {};
    for (const byte of data) {
      frequencies[byte] = (frequencies[byte] || 0) + 1;
    }
    
    let entropy = 0;
    const length = data.length;
    for (const count of Object.values(frequencies)) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }
    
    return entropy;
  };

  const detectTextEncoding = (bytes: Uint8Array): string => {
    // BOM detection
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return 'UTF-8 com BOM';
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return 'UTF-16 LE';
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return 'UTF-16 BE';
    }
    
    // Simple heuristic for UTF-8 vs ASCII
    let hasHighBytes = false;
    for (let i = 0; i < Math.min(bytes.length, 1000); i++) {
      if (bytes[i] > 127) {
        hasHighBytes = true;
        break;
      }
    }
    
    return hasHighBytes ? 'Provavelmente UTF-8' : 'ASCII/UTF-8';
  };

  const getCategoryFromExtension = (ext: string): string => {
    const categories: { [key: string]: string } = {
      // Imagens
      jpg: 'Imagem', jpeg: 'Imagem', png: 'Imagem', gif: 'Imagem', webp: 'Imagem', svg: 'Imagem', bmp: 'Imagem',
      // Documentos
      pdf: 'Documento', doc: 'Documento', docx: 'Documento', txt: 'Documento', rtf: 'Documento',
      // Planilhas
      xls: 'Planilha', xlsx: 'Planilha', csv: 'Planilha',
      // Apresentações  
      ppt: 'Apresentação', pptx: 'Apresentação',
      // Áudio
      mp3: 'Áudio', wav: 'Áudio', flac: 'Áudio', aac: 'Áudio', ogg: 'Áudio',
      // Vídeo
      mp4: 'Vídeo', avi: 'Vídeo', mov: 'Vídeo', wmv: 'Vídeo', mkv: 'Vídeo',
      // Comprimidos
      zip: 'Arquivo Comprimido', rar: 'Arquivo Comprimido', '7z': 'Arquivo Comprimido',
      // Código
      js: 'Código', ts: 'Código', html: 'Código', css: 'Código', json: 'Código', xml: 'Código'
    };
    return categories[ext] || 'Outro';
  };

  const generateSimpleHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 8).toUpperCase();
  };

  const calculateAlterationScore = (metadata: FileMetadata): ScoreResult => {
    const rules: RuleResult[] = [];
    let totalScore = 0;
    
    // TABELA DE PESOS - Consolidada da matriz de validação
    
    // 1. Tamanho do Arquivo (Peso: 1 - Fraco)
    const fileSize = metadata['Tamanho do arquivo'] as number;
    const expectedSize = estimateExpectedFileSize(metadata);
    const sizeDifference = expectedSize ? Math.abs((fileSize - expectedSize) / expectedSize) : 0;
    const sizeSignificant = sizeDifference > 0.3; // 30% de diferença
    
    rules.push({
      category: 'Tamanho do Arquivo',
      detected: sizeSignificant,
      points: sizeSignificant ? 1 : 0,
      weight: 'Fraco',
      description: 'Aumento/redução significativa sem justificativa técnica',
      evidence: sizeSignificant ? `Diferença de ${(sizeDifference * 100).toFixed(1)}% do esperado` : 'Tamanho coerente'
    });
    if (sizeSignificant) totalScore += 1;
    
    // 2. Processo de Codificação (Peso: 3 - Médio)
    const progressiveDCT = checkProgressiveDCT(metadata);
    rules.push({
      category: 'Processo de Codificação',
      detected: progressiveDCT.detected,
      points: progressiveDCT.detected ? 3 : 0,
      weight: 'Médio',
      description: 'Progressive DCT indica reprocessamento',
      evidence: progressiveDCT.evidence
    });
    if (progressiveDCT.detected) totalScore += 3;
    
    // 3. Subamostragem de Cor (Peso: 3 - Médio)
    const ycbcr444 = checkYCbCr444(metadata);
    rules.push({
      category: 'Subamostragem de Cor',
      detected: ycbcr444.detected,
      points: ycbcr444.detected ? 3 : 0,
      weight: 'Médio',
      description: 'YCbCr 4:4:4 é incomum em câmeras',
      evidence: ycbcr444.evidence
    });
    if (ycbcr444.detected) totalScore += 3;
    
    // 4. Perfis ICC (Peso: 3 - Médio)
    const iccProfile = checkICCProfile(metadata);
    rules.push({
      category: 'Perfis ICC',
      detected: iccProfile.detected,
      points: iccProfile.detected ? iccProfile.points : 0,
      weight: 'Médio',
      description: 'ICC HP/Adobe ou ausente indica edição',
      evidence: iccProfile.evidence
    });
    if (iccProfile.detected) totalScore += iccProfile.points;
    
    // 5. EXIF (Peso: 4 - Forte)
    const exifMissing = checkEXIFMissing(metadata);
    rules.push({
      category: 'EXIF (Make/Model/ISO/etc.)',
      detected: exifMissing.detected,
      points: exifMissing.detected ? 4 : 0,
      weight: 'Forte',
      description: 'Ausência total é sinal fortíssimo em Online/IA',
      evidence: exifMissing.evidence
    });
    if (exifMissing.detected) totalScore += 4;
    
    // 6. Tags Adobe/Photoshop (Peso: 3 - Médio)
    const adobeTags = checkAdobeTags(metadata);
    rules.push({
      category: 'Tags Adobe/Photoshop',
      detected: adobeTags.detected,
      points: adobeTags.detected ? 3 : 0,
      weight: 'Médio',
      description: 'APP14, PhotoshopQuality típicos de Photoshop',
      evidence: adobeTags.evidence
    });
    if (adobeTags.detected) totalScore += 3;
    
    // 7. Software (Peso: 4 - Forte)
    const softwareExplicit = checkSoftwareExplicit(metadata);
    rules.push({
      category: 'Software (explícito)',
      detected: softwareExplicit.detected,
      points: softwareExplicit.detected ? 4 : 0,
      weight: 'Forte',
      description: 'Indício direto de edição no campo Software',
      evidence: softwareExplicit.evidence
    });
    if (softwareExplicit.detected) totalScore += 4;
    
    // 8. Software (vazio + padrões) (Peso: 2 - Médio)
    const softwarePattern = checkSoftwarePattern(metadata);
    rules.push({
      category: 'Software (padrão editor online)',
      detected: softwarePattern.detected,
      points: softwarePattern.detected ? 2 : 0,
      weight: 'Médio',
      description: 'Campo vazio + EXIF ausente/ICC genérico',
      evidence: softwarePattern.evidence
    });
    if (softwarePattern.detected) totalScore += 2;
    
    // 9. Datas (Peso: 3 - Médio)
    const dateInconsistency = checkDateInconsistency(metadata);
    rules.push({
      category: 'Datas (CreateDate/ModifyDate)',
      detected: dateInconsistency.detected,
      points: dateInconsistency.detected ? 3 : 0,
      weight: 'Médio',
      description: 'Incoerências são fortes indícios',
      evidence: dateInconsistency.evidence
    });
    if (dateInconsistency.detected) totalScore += 3;
    
    // 10. XMP/Tags IA (Peso: 5 - Muito Forte)
    const aiTags = checkAITags(metadata);
    rules.push({
      category: 'XMP/Tags IA explícitas',
      detected: aiTags.detected,
      points: aiTags.detected ? 5 : 0,
      weight: 'Muito Forte',
      description: 'Prova direta de IA (Google AI, etc.)',
      evidence: aiTags.evidence
    });
    if (aiTags.detected) totalScore += 5;
    
    // 11. C2PA/JUMBF (Peso: 5 - Muito Forte)
    const c2paTags = checkC2PA(metadata);
    rules.push({
      category: 'C2PA/JUMBF Manifest',
      detected: c2paTags.detected,
      points: c2paTags.detected ? 5 : 0,
      weight: 'Muito Forte',
      description: 'Evidência inequívoca de processamento IA',
      evidence: c2paTags.evidence
    });
    if (c2paTags.detected) totalScore += 5;
    
    // BÔNUS DE CO-OCORRÊNCIA
    const bonuses: CoOccurrenceBonus[] = [];
    
    // Bônus 1: Progressive DCT + YCbCr 4:4:4 (+2)
    if (progressiveDCT.detected && ycbcr444.detected) {
      bonuses.push({
        combination: 'Progressive DCT + YCbCr 4:4:4',
        detected: true,
        points: 2,
        description: 'Indica recompressão típica de software de edição'
      });
      totalScore += 2;
    }
    
    // Bônus 2: ICC HP/Adobe + Tags Adobe/Photoshop (+2)
    if (iccProfile.detected && adobeTags.detected) {
      bonuses.push({
        combination: 'Perfis ICC HP/Adobe + Tags Adobe/Photoshop',
        detected: true,
        points: 2,
        description: 'Padrão clássico de Photoshop/reexports Adobe'
      });
      totalScore += 2;
    }
    
    // Bônus 3: Datas incoerentes + Edição técnica (+2)
    if (dateInconsistency.detected && (progressiveDCT.detected || ycbcr444.detected || iccProfile.detected || adobeTags.detected)) {
      bonuses.push({
        combination: 'Datas incoerentes + Edição técnica',
        detected: true,
        points: 2,
        description: 'Combinação de alteração temporal com edição técnica'
      });
      totalScore += 2;
    }
    
    // Bônus 4: EXIF preservado + C2PA IA (+5)
    if (!exifMissing.detected && c2paTags.detected) {
      bonuses.push({
        combination: 'EXIF preservado + C2PA IA',
        detected: true,
        points: 5,
        description: 'Preservação de EXIF + Inserção explícita de C2PA IA'
      });
      totalScore += 5;
    }
    
    // VERIFICAÇÃO DE TRANSPORTE DIGITAL
    const isDigitalTransport = checkDigitalTransport(metadata, rules);
    let adjustedScore = totalScore;
    
    // Aplicar exceção de transporte digital
    if (isDigitalTransport && totalScore > 7) {
      adjustedScore = Math.min(totalScore, 7); // Máximo 7 pontos para transporte digital
    }
    
    // CLASSIFICAÇÃO FINAL
    let classification: string;
    let riskLevel: string;
    let confidenceLevel: string;
    
    if (adjustedScore <= 3) {
      classification = 'Baixo (normal)';
      riskLevel = 'Baixo';
      confidenceLevel = 'Alto';
    } else if (adjustedScore <= 7) {
      classification = 'Moderado (suspeita moderada)';
      riskLevel = 'Moderado';
      confidenceLevel = isDigitalTransport ? 'Moderado' : 'Alto';
    } else if (adjustedScore <= 12) {
      classification = 'Forte (suspeito)';
      riskLevel = 'Alto';
      confidenceLevel = 'Alto';
    } else {
      classification = 'Muito Forte (provável fraude)';
      riskLevel = 'Muito Alto';
      confidenceLevel = 'Muito Alto';
    }
    
    const explanation = generateExplanation(adjustedScore, isDigitalTransport, bonuses);
    
    return {
      totalScore,
      adjustedScore,
      classification,
      riskLevel,
      confidenceLevel,
      isDigitalTransport,
      rules: rules.filter(r => r.detected || r.points > 0), // Mostrar apenas regras relevantes
      bonuses,
      explanation
    };
  };

  // Funções auxiliares para verificação de regras baseadas no relatório ExifTools
  const estimateExpectedFileSize = (metadata: FileMetadata): number | null => {
    const width = metadata['Largura (pixels)'] as number;
    const height = metadata['Altura (pixels)'] as number;
    if (width && height) {
      return (width * height * 0.3); // Fator de compressão médio JPEG
    }
    return null;
  };

  const checkEXIFMissing = (metadata: FileMetadata) => {
    const criticalEXIF = ['Make', 'Model', 'ISO', 'DateTimeOriginal', 'CreateDate'];
    let missingCount = 0;
    const missing = [];
    
    for (const field of criticalEXIF) {
      if (!metadata[field]) {
        missingCount++;
        missing.push(field);
      }
    }
    
    const detected = missingCount >= 3; // Se 3+ campos críticos estão ausentes
    return {
      detected,
      evidence: detected 
        ? `EXIF crítico ausente: ${missing.join(', ')}` 
        : 'EXIF presente e completo'
    };
  };

  const checkAdobeTags = (metadata: FileMetadata) => {
    // Whitelist de padrões conhecidos de firmware/sistema que devem ser excluídos
    const knownFirmwarePatterns = [
      /^[a-z]\d{3}[a-z]\d{2}[a-z]\d{1}$/i, // Samsung firmware pattern (ex: S916BXXS8DYG6)
      /^[a-z0-9]{10,15}$/i,                  // Generic firmware patterns
      /^build\s/i,                           // Build numbers
      /android/i,                            // Android system
      /ios/i,                                // iOS system
      /^[0-9]+\.[0-9]+/                      // Version numbers
    ];

    // Função para verificar se é firmware conhecido
    const isFirmware = (value: string) => {
      return knownFirmwarePatterns.some(pattern => pattern.test(value.trim()));
    };

    // Indicadores específicos de Adobe/Photoshop
    const realAdobeIndicators = [
      'app14flags', 'colortransform', 'app14', 'adobe', 'photoshop'
    ];
    
    for (const [key, value] of Object.entries(metadata)) {
      const keyStr = key.toLowerCase();
      const valueStr = String(value).toLowerCase();
      
      // Verificar se é firmware conhecido - se for, pular
      if (isFirmware(String(value))) {
        continue;
      }
      
      // 1. Busca por ICC Profile Hewlett-Packard (forte indicador Photoshop)
      if (valueStr.includes('hewlett-packard') || valueStr.includes('hp srgb') || 
          valueStr.includes('iec61966-2.1')) {
        return { detected: true, evidence: `ICC Profile Hewlett-Packard detectado em ${key}: ${value}` };
      }
      
      // 2. Busca por tags APP14 específicas
      if (keyStr.includes('app14') || valueStr.includes('app14flags') || 
          valueStr.includes('colortransform')) {
        return { detected: true, evidence: `Tag Adobe APP14 encontrada em ${key}: ${value}` };
      }
      
      // 3. Busca por Progressive DCT (mais específica - não apenas "progressive")
      if (valueStr.includes('progressive dct') || 
          (valueStr.includes('progressive') && (valueStr.includes('huffman') || valueStr.includes('dct')))) {
        return { detected: true, evidence: `Progressive DCT detectado em ${key}: ${value}` };
      }
      
      // 4. Busca específica por Adobe/Photoshop no Software (excluindo firmware)
      if (keyStr === 'software' && (valueStr.includes('adobe') || valueStr.includes('photoshop'))) {
        return { detected: true, evidence: `Software Adobe detectado: ${value}` };
      }
      
      // 5. Busca por outros indicadores Adobe específicos (não genéricos)
      for (const indicator of realAdobeIndicators) {
        if (keyStr.includes(indicator) || valueStr.includes(indicator)) {
          return { detected: true, evidence: `Indicador Adobe encontrado em ${key}: ${value}` };
        }
      }
    }
    
    return { detected: false, evidence: 'Nenhuma tag Adobe/Photoshop detectada' };
  };

  // Função específica para detectar Progressive DCT
  const checkProgressiveDCT = (metadata: FileMetadata) => {
    for (const [key, value] of Object.entries(metadata)) {
      const valueStr = String(value).toLowerCase();
      if (valueStr.includes('progressive dct') || 
          (valueStr.includes('progressive') && valueStr.includes('huffman'))) {
        return { detected: true, evidence: `Progressive DCT encontrado em ${key}: ${value}` };
      }
    }
    return { detected: false, evidence: 'Baseline DCT (padrão câmera)' };
  };

  // Função específica para detectar YCbCr 4:4:4
  const checkYCbCr444 = (metadata: FileMetadata) => {
    for (const [key, value] of Object.entries(metadata)) {
      const valueStr = String(value).toLowerCase();
      // Busca mais específica por YCbCr4:4:4
      if (valueStr.includes('ycbcr4:4:4') || valueStr.includes('ycbcr 4:4:4') ||
          (valueStr.includes('ycbcr') && valueStr.includes('4:4:4'))) {
        return { detected: true, evidence: `YCbCr 4:4:4 encontrado em ${key}: ${value}` };
      }
    }
    return { detected: false, evidence: 'YCbCr 4:2:0 ou não detectado' };
  };

  // Função específica para detectar ICC Profile Hewlett-Packard
  const checkICCProfile = (metadata: FileMetadata) => {
    let points = 0;
    let evidence = 'ICC padrão câmera';
    
    for (const [key, value] of Object.entries(metadata)) {
      const valueStr = String(value).toLowerCase();
      
      // Prioridade máxima: Hewlett-Packard (forte indicador Photoshop)
      if (valueStr.includes('hewlett-packard') || valueStr.includes('hp srgb') ||
          valueStr.includes('iec61966-2.1')) {
        points = 3;
        evidence = `ICC Hewlett-Packard encontrado em ${key}: ${value}`;
        break;
      }
      // Adobe profiles
      else if (valueStr.includes('adobe')) {
        points = 3;
        evidence = `ICC Adobe encontrado em ${key}: ${value}`;
      }
      // Generic sRGB (menor peso)
      else if (valueStr.includes('srgb') && !valueStr.includes('google') && 
               !valueStr.includes('apple') && !valueStr.includes('samsung')) {
        if (points < 2) {
          points = 2;
          evidence = `ICC genérico encontrado em ${key}: ${value}`;
        }
      }
      // ICC ausente
      else if (key.toLowerCase().includes('icc') && (!value || valueStr === '')) {
        if (points < 3) {
          points = 3;
          evidence = 'ICC ausente';
        }
      }
    }
    
    return { detected: points > 0, points, evidence };
  };

  const checkSoftwareExplicit = (metadata: FileMetadata) => {
    const software = metadata['Software'] as string;
    if (software) {
      const softwareStr = software.toLowerCase();
      const editors = ['photoshop', 'photopea', 'canva', 'pixlr', 'fotor', 'befunky', 'gimp', 'ai'];
      
      for (const editor of editors) {
        if (softwareStr.includes(editor)) {
          return { detected: true, evidence: `Editor detectado: ${software}` };
        }
      }
    }
    
    return { detected: false, evidence: 'Software não detectado ou firmware câmera' };
  };

  const checkSoftwarePattern = (metadata: FileMetadata) => {
    const software = metadata['Software'];
    const exifMissing = !metadata['Make'] || !metadata['Model'];
    const iccGeneric = checkICCProfile(metadata).points > 0;
    
    if (!software && exifMissing && iccGeneric) {
      return { 
        detected: true, 
        evidence: 'Padrão editor online: Software vazio + EXIF ausente + ICC genérico' 
      };
    }
    
    return { detected: false, evidence: 'Padrão não corresponde a editor online' };
  };

  const checkDateInconsistency = (metadata: FileMetadata) => {
    const createDate = metadata['CreateDate'] || metadata['DateTimeOriginal'];
    const modifyDate = metadata['ModifyDate'];
    const fileModify = metadata['Última modificação'] as Date;
    
    if (createDate && modifyDate && createDate !== modifyDate) {
      return {
        detected: true,
        evidence: `EXIF CreateDate (${createDate}) ≠ ModifyDate (${modifyDate})`
      };
    }
    
    if (fileModify && createDate) {
      // Comparar timestamp do arquivo com EXIF
      const createStr = String(createDate);
      if (!createStr.includes(fileModify.getFullYear().toString())) {
        return {
          detected: true,
          evidence: `Data arquivo (${fileModify.getFullYear()}) ≠ EXIF (${createStr})`
        };
      }
    }
    
    return { detected: false, evidence: 'Datas coerentes' };
  };

  const checkAITags = (metadata: FileMetadata) => {
    const aiIndicators = [
      'google ai', 'edited with google ai', 'compositewithtrainedalgorithmic',
      'ai generated', 'artificial intelligence', 'machine learning',
      'samsung ai', 'enhanced by ai'
    ];
    
    for (const [key, value] of Object.entries(metadata)) {
      const valueStr = String(value).toLowerCase();
      
      for (const indicator of aiIndicators) {
        if (valueStr.includes(indicator)) {
          return { detected: true, evidence: `Tag IA encontrada em ${key}: ${value}` };
        }
      }
    }
    
    return { detected: false, evidence: 'Nenhuma tag IA detectada' };
  };

  const checkC2PA = (metadata: FileMetadata) => {
    const c2paIndicators = ['c2pa', 'jumbf', 'cbor', 'manifest', 'content credentials'];
    
    for (const [key, value] of Object.entries(metadata)) {
      const keyStr = key.toLowerCase();
      const valueStr = String(value).toLowerCase();
      
      for (const indicator of c2paIndicators) {
        if (keyStr.includes(indicator) || valueStr.includes(indicator)) {
          return { detected: true, evidence: `C2PA/JUMBF encontrado em ${key}: ${value}` };
        }
      }
    }
    
    return { detected: false, evidence: 'Nenhum manifesto C2PA detectado' };
  };

  const checkDigitalTransport = (metadata: FileMetadata, rules: RuleResult[]): boolean => {
    // Verificar padrão de transporte digital puro:
    // - EXIF ausente
    // - Redução de resolução/tamanho proporcional
    // - Perfis ICC mantidos ou genéricos
    // - Subamostragem mantida em 4:2:0
    // - Campo Software ausente
    
    const exifMissing = rules.find(r => r.category === 'EXIF (Make/Model/ISO/etc.)')?.detected || false;
    const softwareEmpty = !metadata['Software'];
    const ycbcr420 = !rules.find(r => r.category === 'Subamostragem de Cor')?.detected; // Se não detectou 4:4:4, assume 4:2:0
    const iccMaintained = rules.find(r => r.category === 'Perfis ICC')?.points <= 2; // Só genérico, não HP/Adobe
    
    return exifMissing && softwareEmpty && ycbcr420 && iccMaintained;
  };

  const generateExplanation = (score: number, isDigitalTransport: boolean, bonuses: CoOccurrenceBonus[]): string => {
    let explanation = `Pontuação total: ${score} pontos. `;
    
    if (isDigitalTransport) {
      explanation += 'Padrão compatível com transporte digital (WhatsApp, Telegram, etc.). ';
    }
    
    if (bonuses.length > 0) {
      explanation += `Detectados ${bonuses.length} padrão(ões) de co-ocorrência que reforçam indícios. `;
    }
    
    if (score <= 3) {
      explanation += 'Arquivo apresenta características normais de documento original.';
    } else if (score <= 7) {
      explanation += 'Indícios isolados ou compatível com compressão/transporte digital.';
    } else if (score <= 12) {
      explanation += 'Conjunto consistente de indícios técnicos de manipulação.';
    } else {
      explanation += 'Múltiplos indícios técnicos indicam alta probabilidade de manipulação.';
    }
    
    return explanation;
  };

  const getIconForKey = (key: string) => {
    if (key.toLowerCase().includes('nome') || key.toLowerCase().includes('extensão')) {
      return <FileText className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('data') || key.toLowerCase().includes('modificação')) {
      return <Calendar className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('tamanho')) {
      return <HardDrive className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('hash')) {
      return <Hash className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('pixel') || key.toLowerCase().includes('dimensão') || key.toLowerCase().includes('largura') || key.toLowerCase().includes('altura')) {
      return <Image className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('gps') || key.toLowerCase().includes('latitude') || key.toLowerCase().includes('longitude')) {
      return <MapPin className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('câmera') || key.toLowerCase().includes('iso') || key.toLowerCase().includes('abertura')) {
      return <Camera className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('cor') || key.toLowerCase().includes('espaço')) {
      return <Palette className="h-4 w-4" />;
    }
    if (key.toLowerCase().includes('entropia') || key.toLowerCase().includes('bytes')) {
      return <Zap className="h-4 w-4" />;
    }
    return null;
  };

  const metadataEntries = Object.entries(metadata);

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
      <CardContent>
        <Accordion type="multiple" defaultValue={["metadata", "analysis"]} className="w-full">
          {/* Seção de Metadados */}
          <AccordionItem value="metadata">
            <AccordionTrigger className="text-lg font-semibold">
              📄 Metadados Extraídos ({metadataEntries.length} campos)
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3 mt-4">
                {metadataEntries.map(([key, value], index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {getIconForKey(key) && (
                        <div className="text-primary">
                          {getIconForKey(key)}
                        </div>
                      )}
                      <span className="font-medium text-foreground">{key}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {key === 'Categoria' ? (
                        <Badge variant="secondary" className="text-xs">
                          {formatValue(value)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground font-mono text-sm max-w-xs text-right truncate">
                          {formatValue(value)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-border">
                <p className="text-sm text-muted-foreground text-center">
                  Total de metadados encontrados: <span className="font-semibold text-foreground">{metadataEntries.length}</span>
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Seção de Análise de Alteração */}
          {scoreResult && (
            <AccordionItem value="analysis">
              <AccordionTrigger className="text-lg font-semibold">
                🔍 Análise de Alteração - Matriz de Validação 
                <Badge 
                  variant={
                    scoreResult.riskLevel === 'Muito Alto' ? 'destructive' : 
                    scoreResult.riskLevel === 'Alto' ? 'destructive' :
                    scoreResult.riskLevel === 'Moderado' ? 'secondary' : 'outline'
                  }
                  className="ml-2"
                >
                  {scoreResult.adjustedScore} pts - {scoreResult.riskLevel}
                </Badge>
              </AccordionTrigger>
              <AccordionContent>
                <div className="mt-4 p-6 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg border border-border">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">
                        {scoreResult.confidenceLevel} Confiança
                      </Badge>
                      <Badge 
                        variant={
                          scoreResult.riskLevel === 'Muito Alto' ? 'destructive' : 
                          scoreResult.riskLevel === 'Alto' ? 'destructive' :
                          scoreResult.riskLevel === 'Moderado' ? 'secondary' : 'outline'
                        }
                        className="text-sm font-semibold"
                      >
                        {scoreResult.classification}
                      </Badge>
                    </div>
                    <span className="text-2xl font-bold text-primary">
                      {scoreResult.adjustedScore} pts
                    </span>
                  </div>

                  {scoreResult.isDigitalTransport && (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        <strong>Transporte Digital Detectado:</strong> Padrão compatível com compressão por WhatsApp, Telegram ou similar. 
                        Pontuação limitada a máximo 7 pontos.
                      </p>
                    </div>
                  )}
                  
                  <div className="mb-6">
                    <h4 className="font-semibold text-foreground mb-3">Detalhamento por Categoria:</h4>
                    <div className="grid gap-3">
                      {scoreResult.rules.map((rule, index) => (
                        <div
                          key={index}
                          className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                            rule.detected 
                              ? 'bg-destructive/10 border-destructive/20' 
                              : 'bg-muted/30 border-border'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {rule.detected ? (
                              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{rule.category}</span>
                                <Badge variant="outline" className="text-xs">
                                  {rule.weight}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{rule.description}</p>
                              <p className="text-xs text-muted-foreground mt-1 italic">
                                {rule.evidence}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={rule.detected ? 'destructive' : 'outline'}
                              className="text-xs"
                            >
                              {rule.detected ? `+${rule.points}` : '0'} pts
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {scoreResult.bonuses.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-semibold text-foreground mb-3">Bônus de Co-ocorrência:</h4>
                      <div className="grid gap-2">
                        {scoreResult.bonuses.map((bonus, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg"
                          >
                            <div>
                              <span className="font-medium text-orange-800 dark:text-orange-200">{bonus.combination}</span>
                              <p className="text-sm text-orange-700 dark:text-orange-300">{bonus.description}</p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              +{bonus.points} pts
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="p-4 bg-muted/20 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-foreground">
                        Pontuação: {scoreResult.totalScore} pts 
                        {scoreResult.adjustedScore !== scoreResult.totalScore && (
                          <span className="text-muted-foreground">
                            → {scoreResult.adjustedScore} pts (ajustado)
                          </span>
                        )}
                      </span>
                      <Badge 
                        variant={scoreResult.riskLevel === 'Muito Alto' ? 'destructive' : 
                                scoreResult.riskLevel === 'Alto' ? 'destructive' :
                                scoreResult.riskLevel === 'Moderado' ? 'secondary' : 'outline'}
                      >
                        {scoreResult.riskLevel}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {scoreResult.explanation}
                    </p>
                    <div className="mt-2 text-xs text-muted-foreground">
                      <strong>Escala:</strong> 0-3 (Baixo) | 4-7 (Moderado) | 8-12 (Alto) | 13+ (Muito Alto)
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </CardContent>
    </Card>
  );
}

export default MetadataDisplay;